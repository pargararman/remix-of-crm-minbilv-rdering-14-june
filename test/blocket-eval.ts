// Blocket valuation eval / test runner.
//
// Runs the Blocket provider against the TNH357 test vehicle and prints the
// resulting second-cheapest-based customer valuation. Two modes:
//
//   LIVE (default): hits the real Blocket endpoint. Run this in YOUR environment
//   (Cloudflare/local) where blocket.se is reachable.
//     npx tsx test/blocket-eval.ts
//     npx tsx test/blocket-eval.ts --regnr TNH357        (regnr is informational)
//
//   FIXTURE: no network -- uses test/fixtures/blocket-xc90-t8.json. Use in CI /
//   sandboxes where blocket.se is blocked.
//     npx tsx test/blocket-eval.ts --fixture
//
// Also runnable with modern Node's type stripping:
//     node --experimental-strip-types test/blocket-eval.ts --fixture

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { valuateWithBlocket } from "../src/lib/valuation/blocket-provider";
import type { BlocketSearchParams } from "../src/lib/valuation/types";
import {
  TNH357_VEHICLE,
  TNH357_REGNR,
  TNH357_VIN,
  TNH357_EXTRA_INFO,
} from "./fixtures/vehicle-tnh357";

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const useFixture = args.includes("--fixture");
const regnrArg = (() => {
  const i = args.indexOf("--regnr");
  return i >= 0 && args[i + 1] ? args[i + 1] : TNH357_REGNR;
})();

function fixtureFetcher(_params: BlocketSearchParams): Promise<unknown> {
  const p = join(__dirname, "fixtures", "blocket-xc90-t8.json");
  return Promise.resolve(JSON.parse(readFileSync(p, "utf8")));
}

const sek = (n: number | null) =>
  n == null ? "—" : `${n.toLocaleString("sv-SE")} kr`;

async function main() {
  console.log("=== Blocket valuation eval ===");
  console.log(`Mode      : ${useFixture ? "FIXTURE (offline)" : "LIVE (blocket.se)"}`);
  console.log(`Regnr     : ${regnrArg}`);
  console.log(`VIN       : ${TNH357_VIN}`);
  console.log(
    `Vehicle   : ${TNH357_VEHICLE.brand} ${TNH357_VEHICLE.model} ${TNH357_VEHICLE.version}, ` +
      `${TNH357_VEHICLE.horsepower}hk, ${TNH357_VEHICLE.year}`,
  );
  console.log(
    `Mileage   : ${TNH357_VEHICLE.mileage_mil?.toLocaleString("sv-SE")} mil ` +
      `(${((TNH357_VEHICLE.mileage_mil ?? 0) * 10).toLocaleString("sv-SE")} km)`,
  );
  console.log(`Färg      : ${TNH357_EXTRA_INFO.color}\n`);

  const result = await valuateWithBlocket(TNH357_VEHICLE, {
    fetcher: useFixture ? fixtureFetcher : undefined,
  });

  console.log("Search params sent to Blocket:");
  console.log(JSON.stringify(result.query, null, 2), "\n");

  if (!result.ok) {
    console.log(`❌ ${result.note}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Raw listings         : ${result.totalCount}`);
  console.log(`Comparable listings  : ${result.comparableCount}`);
  console.log(`Used listings        : ${result.sampleSize}`);
  console.log(`Seller split         : dealers=${result.dealerCount}, private=${result.privateCount}, available=${result.sellerTypeAvailable}`);
  console.log(`Market median        : ${sek(result.marketMedian)}`);
  console.log(`Market range (P25–P75): ${sek(result.marketLow)} – ${sek(result.marketHigh)}`);
  if (result.customerOffer) {
    console.log(`Reference (2nd low)  : ${sek(result.customerOffer.referencePrice)}`);
    console.log(`Deduction            : ${sek(result.customerOffer.deduction)} (${result.customerOffer.deductionBand})`);
    console.log(`Customer offer       : ${sek(result.customerOffer.customerOffer)}`);
    console.log(`Text                 : ${result.customerOffer.explanationText}`);
  }
  console.log(`Confidence           : ${(result.confidence * 100).toFixed(0)}%`);

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
