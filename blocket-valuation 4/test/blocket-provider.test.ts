import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  percentile,
  extractComps,
  buildSearchParams,
  valuateWithBlocket,
} from "../src/lib/valuation/blocket-provider";
import { TNH357_VEHICLE } from "./fixtures/vehicle-tnh357";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "blocket-xc90-t8.json"), "utf8"),
);

describe("percentile", () => {
  it("interpolates linearly", () => {
    const xs = [10, 20, 30, 40, 50];
    expect(percentile(xs, 0.5)).toBe(30);
    expect(percentile(xs, 0.25)).toBe(20);
    expect(percentile(xs, 0.75)).toBe(40);
  });
  it("handles single + empty", () => {
    expect(percentile([42], 0.9)).toBe(42);
    expect(Number.isNaN(percentile([], 0.5))).toBe(true);
  });
});

describe("extractComps", () => {
  it("pulls nested price.amount listings and de-dupes", () => {
    const comps = extractComps(fixture);
    expect(comps).toHaveLength(12);
    expect(comps.every((c) => c.price >= 5000)).toBe(true);
    expect(comps[0]).toMatchObject({ year: expect.any(Number) });
  });
  it("ignores tiny non-car amounts", () => {
    const comps = extractComps({ data: [{ price: 199 }, { price: { amount: 250000 } }] });
    expect(comps).toHaveLength(1);
    expect(comps[0].price).toBe(250000);
  });
});

describe("buildSearchParams", () => {
  it("maps vehicle -> Blocket params with bands", () => {
    const p = buildSearchParams(TNH357_VEHICLE);
    expect(p.q).toBe("Volvo XC90");
    expect(p.make).toBe("0.818"); // Volvo
    expect(p.year_from).toBe(2018);
    expect(p.year_to).toBe(2020);
    expect(p.milage_from).toBe(14255 - 3000);
    expect(p.milage_to).toBe(14255 + 3000);
    expect(p.transmission).toBe(2); // automatisk
  });
});

describe("valuateWithBlocket (fixture)", () => {
  it("produces a sane market + sold range", async () => {
    const r = await valuateWithBlocket(TNH357_VEHICLE, {
      fetcher: () => Promise.resolve(fixture),
    });
    expect(r.ok).toBe(true);
    expect(r.sampleSize).toBe(12);
    expect(r.marketLow!).toBeLessThan(r.marketHigh!);
    expect(r.marketMedian!).toBeGreaterThan(r.marketLow!);
    expect(r.marketMedian!).toBeLessThan(r.marketHigh!);
    // sold range is the asking range minus 5%
    expect(r.soldLow!).toBe(Math.round((r.marketLow! * 0.95) / 100) * 100);
    expect(r.confidence).toBeGreaterThan(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
  });

  it("fails gracefully with no comps", async () => {
    const r = await valuateWithBlocket(TNH357_VEHICLE, {
      fetcher: () => Promise.resolve({ data: [] }),
    });
    expect(r.ok).toBe(false);
    expect(r.note).toMatch(/Inga jämförbara/);
  });
});
