import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  percentile,
  extractComps,
  buildSearchParams,
  filterToComparable,
  titleMatchesModel,
  hasEnoughSpec,
  locateListingArray,
  detectSellerField,
  valuateWithBlocket,
} from "../src/lib/valuation/blocket-provider";
import { computeOffer, deductionFor, buildValuationText } from "../src/lib/valuation/engine";
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
  it("reads the listing array only (no tree scrape) and de-dupes", () => {
    const comps = extractComps(fixture);
    expect(comps).toHaveLength(12);
    expect(comps.every((c) => c.price >= 10000)).toBe(true);
  });
  it("ignores price-like nodes that are NOT in the listing array", () => {
    // A stats block / promo with a price must NOT become a comp.
    const payload = {
      stats: { average: { amount: 450000 } },
      promo: { price: 99000 },
      data: [{ ad_id: "1", subject: "Volvo XC90 T8", price: { amount: 350000 }, modelYear: 2019, mileage: 14000 }],
    };
    const comps = extractComps(payload);
    expect(comps).toHaveLength(1);
    expect(comps[0].price).toBe(350000);
  });
});

describe("locateListingArray / detectSellerField", () => {
  it("locates the listing array by known key and reports it", () => {
    const { key, arr } = locateListingArray(fixture);
    expect(key).toBe("data");
    expect(arr.length).toBe(12);
  });
  it("auto-detects an unknown listing key without scraping unrelated nodes", () => {
    const payload = {
      stats: { average: { amount: 450000 } },
      whatever: [
        { ad_id: "1", subject: "Volvo XC90", price: { amount: 350000 } },
        { ad_id: "2", subject: "Volvo XC90", price: { amount: 360000 } },
      ],
    };
    const { key, arr } = locateListingArray(payload);
    expect(key).toBe("auto:whatever");
    expect(arr.length).toBe(2);
  });
  it("reports seller field presence", () => {
    expect(detectSellerField([{ dealer_segment: "Företag" }])).toBe("dealer_segment");
    expect(detectSellerField([{ subject: "x", price: 1 }])).toBe(null); // fixture-like
  });
});

describe("titleMatchesModel", () => {
  it("accepts the target model and rejects neighbours", () => {
    expect(titleMatchesModel("Volvo XC90 T8 AWD Inscription", "XC90")).toBe(true);
    expect(titleMatchesModel("Volvo XC 90 Recharge", "XC90")).toBe(true); // spaced
    expect(titleMatchesModel("Volvo XC60 Recharge T6", "XC90")).toBe(false);
    expect(titleMatchesModel("Volvo V60 Recharge T6", "XC90")).toBe(false);
  });
});

describe("filterToComparable", () => {
  it("drops wrong model and out-of-band mileage", () => {
    const comps = extractComps(fixture);
    const out = filterToComparable(comps, TNH357_VEHICLE);
    // target 2019 / 14255 mil, bands +/-2 yr, +/-4000 mil
    expect(out.length).toBe(8);
    expect(out.every((c) => titleMatchesModel(c.title, "XC90"))).toBe(true);
    expect(out.every((c) => Math.abs((c.mileage_mil ?? 0) - 14255) <= 4000)).toBe(true);
  });
  it("removes XC60/V60 entirely from an XC90 search", () => {
    const mixed = extractComps({
      data: [
        { ad_id: "a", subject: "Volvo XC90 T8 AWD", price: { amount: 390000 }, modelYear: 2019, mileage: 14000 },
        { ad_id: "b", subject: "Volvo XC60 Recharge T6", price: { amount: 419900 }, modelYear: 2019, mileage: 14000 },
        { ad_id: "c", subject: "Volvo V60 Recharge", price: { amount: 449500 }, modelYear: 2019, mileage: 14000 },
      ],
    });
    const out = filterToComparable(mixed, TNH357_VEHICLE);
    expect(out.map((c) => c.id)).toEqual(["a"]);
  });
});

describe("hasEnoughSpec", () => {
  it("requires brand+model+year+mileage", () => {
    expect(hasEnoughSpec(TNH357_VEHICLE)).toBe(true);
    expect(hasEnoughSpec({ brand: "Volvo", model: "XC90" })).toBe(false); // the XEH81G case
    expect(hasEnoughSpec({ brand: "Volvo", model: "XC90", year: 2019 })).toBe(false);
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

describe("valuateWithBlocket", () => {
  it("values only comparable cars and reports honest counts", async () => {
    const r = await valuateWithBlocket(TNH357_VEHICLE, {
      fetcher: () => Promise.resolve(fixture),
    });
    expect(r.ok).toBe(true);
    expect(r.totalCount).toBe(12);
    expect(r.comparableCount).toBe(8);
    expect(r.sampleSize).toBe(8);
    expect(r.sellerTypeAvailable).toBe(false);
    expect(r.marketLow!).toBeLessThan(r.marketHigh!);
    expect(r.offerMedian!).toBeGreaterThan(0);
    // fixture has no seller type -> values on all comparable, says so
    expect(r.note).toMatch(/handlare\/privat/i);
  });

  it("uses DEALER listings only when seller type IS available", async () => {
    // Build 6 comparable XC90 ads, 5 dealer + 1 private, with a seller field.
    const mk = (i: number, seg: string) => ({
      ad_id: String(i),
      subject: "Volvo XC90 T8 AWD",
      price: { amount: 380000 + i * 5000 },
      modelYear: 2019,
      mileage: 14000,
      dealer_segment: seg,
    });
    const payload = {
      data: [mk(1, "Företag"), mk(2, "Företag"), mk(3, "Företag"), mk(4, "Företag"), mk(5, "Företag"), mk(6, "Privat")],
    };
    const r = await valuateWithBlocket(TNH357_VEHICLE, { fetcher: () => Promise.resolve(payload) });
    expect(r.ok).toBe(true);
    expect(r.sellerTypeAvailable).toBe(true);
    expect(r.dealerCount).toBe(5); // private one excluded from the valuation
    expect(r.privateCount).toBe(1);
    expect(r.note).toMatch(/handlarannonser/i);
  });

  it("refuses to value without enough spec (the XEH81G case)", async () => {
    const r = await valuateWithBlocket(
      { brand: "Volvo", model: "XC90" },
      { fetcher: () => Promise.resolve(fixture) },
    );
    expect(r.ok).toBe(false);
    expect(r.note).toMatch(/årsmodell.*miltal|miltal/i);
  });

  it("refuses when too few comparable cars come back", async () => {
    const r = await valuateWithBlocket(TNH357_VEHICLE, {
      fetcher: () =>
        Promise.resolve({
          data: [
            { ad_id: "b", subject: "Volvo XC60 Recharge T6", price: { amount: 419900 }, modelYear: 2019, mileage: 14000 },
            { ad_id: "c", subject: "Volvo V60 Recharge", price: { amount: 449500 }, modelYear: 2019, mileage: 14000 },
          ],
        }),
    });
    expect(r.ok).toBe(false);
    expect(r.note).toMatch(/för få jämförbara/i);
  });
});

describe("engine.computeOffer (2nd-cheapest − X)", () => {
  it("uses the second cheapest comparable and the band deduction", () => {
    // Spec example, but band-based X (333k -> 200–400k -> 40k flat).
    const o = computeOffer({ comparablePrices: [320_000, 333_000, 345_000, 360_000] });
    expect(o.referencePrice).toBe(333_000); // 2nd cheapest
    expect(o.deduction).toBe(40_000); // 200–400k band
    expect(o.customerOffer).toBe(293_000); // 333k − 40k
  });
  it("is insensitive to input order", () => {
    const o = computeOffer({ comparablePrices: [360_000, 333_000, 360_000, 320_000, 345_000] });
    expect(o.referencePrice).toBe(333_000);
  });
  it("deduction scales by band (midpoint for % bands, floored at 40k)", () => {
    expect(deductionFor(150_000).amount).toBe(30_000); // <200k flat
    expect(deductionFor(333_000).amount).toBe(40_000); // 200–400k flat
    expect(deductionFor(500_000).amount).toBe(45_000); // 9% midpoint of 500k
    expect(deductionFor(800_000).amount).toBe(88_000); // 11% midpoint of 800k
  });
  it("explanation text matches the actual numbers", () => {
    const o = computeOffer({ comparablePrices: [320_000, 333_000, 345_000, 360_000] });
    expect(o.explanation).toContain("333 000");
    expect(o.explanation).toContain("40 000");
    expect(o.explanation).toContain("293 000");
    expect(o.explanation).toMatch(/näst lägsta/i);
    const en = buildValuationText(o, "en");
    expect(en).toMatch(/second lowest comparable price/i);
    expect(en).toContain("293,000");
  });
});
