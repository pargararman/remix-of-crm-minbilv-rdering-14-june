// Blocket valuation eval / test runner.
//
// Runs the Blocket provider against a test vehicle and prints the resulting
// market + estimated-sold range. Two modes:
//
//   LIVE (default): hits the real Blocket endpoint. Run this in YOUR environment
//   (Cloudflare/local) where blocket.se is reachable.
//     npx tsx test/blocket-eval.ts --regnr ZJA092
//
//   FIXTURE: no network -- uses the matching test/fixtures/*.json. Use in CI /
//   sandboxes where blocket.se is blocked.
//     npx tsx test/blocket-eval.ts --regnr ZJA092 --fixture
//
// Known test plates: TNH357 (2019 XC90 T8), ZJA092 (2023 XC90 T8). Defaults to ZJA092.
// Also runnable with Node type stripping:
//     node --experimental-strip-types test/blocket-eval.ts --fixture

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { valuateWithBlocket } from "../src/lib/valuation/blocket-provider";
import type { BlocketSearchParams, ValuationVehicle } from "../src/lib/valuation/types";
import { TNH357_VEHICLE, TNH357_VIN } from "./fixtures/vehicle-tnh357";
import { ZJA092_VEHICLE, ZJA092_VIN } from "./fixtures/vehicle-zja092";

const __dirname = dirname(fileURLToPath(import.meta.url));

type TestCase = {
  regnr: string;
  vin: string;
  vehicle: ValuationVehicle & { registration_number: string; horsepower: number };
  fixture: string;
};

const CASES: Record<string, TestCase> = {
  TNH357: { regnr: "TNH357", vin: TNH357_VIN, vehicle: TNH357_VEHICLE, fixture: "blocket-xc90-t8.json" },
  ZJA092: { regnr: "ZJA092", vin: ZJA092_VIN, vehicle: ZJA092_VEHICLE, fixture: "blocket-xc90-t8-2023.json" },
};

const args = process.argv.slice(2);
const useFixture = args.includes("--fixture");
const regnrArg = (() => {
  const i = args.indexOf("--regnr");
  return (i >= 0 && args[i + 1] ? args[i + 1] : "ZJA092").toUpperCase();
})();

const tc = CASES[regnrArg];
if (!tc) {
  console.error(`Unknown plate "${regnrArg}". Known: ${Object.keys(CASES).join(", ")}`);
  process.exit(1);
}

function fixtureFetcher(_params: BlocketSearchParams): Promise<unknown> {
  const p = join(__dirname, "fixtures", tc.fixture);
  return Promise.resolve(JSON.parse(readFileSync(p, "utf8")));
}

const sek = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("sv-SE")} kr`);

async function main() {
  const v = tc.vehicle;
  console.log("=== Blocket valuation eval ===");
  console.log(`Mode      : ${useFixture ? "FIXTURE (offline)" : "LIVE (blocket.se)"}`);
  console.log(`Regnr     : ${tc.regnr}`);
  console.log(`VIN       : ${tc.vin}`);
  console.log(`Vehicle   : ${v.brand} ${v.model} ${v.version}, ${v.horsepower}hk, ${v.year}`);
  console.log(
    `Mileage   : ${v.mileage_mil?.toLocaleString("sv-SE")} mil ` +
      `(${((v.mileage_mil ?? 0) * 10).toLocaleString("sv-SE")} km)\n`,
  );

  const result = await valuateWithBlocket(v, {
    fetcher: useFixture ? fixtureFetcher : undefined,
  });

  console.log("Search params sent to Blocket:");
  console.log(JSON.stringify(result.query, null, 2), "\n");

  if (!result.ok) {
    console.log(`X ${result.note}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Comparable listings : ${result.sampleSize}`);
  console.log(`Median asking       : ${sek(result.marketMedian)}`);
  console.log(`Market range (P25-P75 asking) : ${sek(result.marketLow)} - ${sek(result.marketHigh)}`);
  console.log(`Est. sold range (-5% asking)  : ${sek(result.soldLow)} - ${sek(result.soldHigh)}`);
  console.log(`Confidence          : ${(result.confidence * 100).toFixed(0)}%`);

  console.log("\nTop comps:");
  for (const c of result.comps.slice(0, 8)) {
    console.log(
      `  ${sek(c.price).padStart(12)}  ${c.year ?? "?"}  ${c.mileage_mil ?? "?"} mil  ${c.title ?? ""}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
