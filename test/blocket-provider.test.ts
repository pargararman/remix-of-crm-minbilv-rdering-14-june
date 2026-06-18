import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  buildSearchParams,
  detectSellerField,
  extractComps,
  filterToComparable,
  locateListingArray,
  percentile,
  titleMatchesModel,
  valuateWithBlocket,
} from "../src/lib/valuation/blocket-provider";
import { calculateCustomerOffer, deductionForReference } from "../src/lib/valuation/engine";
import {
  blocketVehicleFingerprint,
  getMissingBlocketVehicleFields,
  isVehicleCompleteForBlocket,
} from "../src/lib/valuation/vehicle-validation";
import { TNH357_VEHICLE } from "./fixtures/vehicle-tnh357";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(__dirname, "fixtures", "blocket-xc90-t8.json"), "utf8"));

describe("percentile", () => {
  it("interpolates linearly", () => {
    const xs = [10, 20, 30, 40, 50];
    expect(percentile(xs, 0.5)).toBe(30);
    expect(percentile(xs, 0.25)).toBe(20);
    expect(percentile(xs, 0.75)).toBe(40);
  });
});

describe("Blocket vehicle completeness validation", () => {
  it("does not allow lookup when only brand/model exists", async () => {
    let called = 0;
    const vehicle = { brand: "Volvo", model: "XC90" };
    expect(isVehicleCompleteForBlocket(vehicle)).toBe(false);
    expect(getMissingBlocketVehicleFields(vehicle)).toEqual([
      "Version / utförande",
      "Årsmodell",
      "Miltal",
      "Drivmedel",
      "Växellåda",
      "Karosstyp",
      "Drivhjul",
      "Hästkrafter",
    ]);

    const r = await valuateWithBlocket(vehicle, {
      fetcher: async () => {
        called += 1;
        return fixture;
      },
    });
    expect(called).toBe(0);
    expect(r.ok).toBe(false);
  });

  it("treats dropdown placeholder '-' as missing", async () => {
    let called = 0;
    const vehicle = {
      ...TNH357_VEHICLE,
      fuel: "-",
      gearbox: "-",
      body_type: "-",
      drive_type: "-",
    };
    expect(isVehicleCompleteForBlocket(vehicle)).toBe(false);
    expect(getMissingBlocketVehicleFields(vehicle)).toEqual(["Drivmedel", "Växellåda", "Karosstyp", "Drivhjul"]);

    const r = await valuateWithBlocket(vehicle, {
      fetcher: async () => {
        called += 1;
        return fixture;
      },
    });
    expect(called).toBe(0);
    expect(r.ok).toBe(false);
  });

  it("treats dropdown value 'okant' as missing", () => {
    const vehicle = {
      ...TNH357_VEHICLE,
      fuel: "okant",
      gearbox: "okant",
      body_type: "okant",
      drive_type: "okant",
    };
    expect(isVehicleCompleteForBlocket(vehicle)).toBe(false);
    expect(getMissingBlocketVehicleFields(vehicle)).toEqual(["Drivmedel", "Växellåda", "Karosstyp", "Drivhjul"]);
  });

  it("does not allow invalid mileage/year/horsepower", async () => {
    let called = 0;
    const vehicle = { ...TNH357_VEHICLE, year: 1800, mileage_mil: 0, horsepower: 0 };
    expect(isVehicleCompleteForBlocket(vehicle)).toBe(false);
    expect(getMissingBlocketVehicleFields(vehicle)).toEqual(["Årsmodell", "Miltal", "Hästkrafter"]);

    const r = await valuateWithBlocket(vehicle, {
      fetcher: async () => {
        called += 1;
        return fixture;
      },
    });
    expect(called).toBe(0);
    expect(r.ok).toBe(false);
  });

  it("allows lookup when all mandatory fields are valid", async () => {
    let called = 0;
    expect(isVehicleCompleteForBlocket(TNH357_VEHICLE)).toBe(true);
    expect(getMissingBlocketVehicleFields(TNH357_VEHICLE)).toEqual([]);

    const r = await valuateWithBlocket(TNH357_VEHICLE, {
      fetcher: async () => {
        called += 1;
        return fixture;
      },
    });
    expect(called).toBe(1);
    expect(r.ok).toBe(true);
  });

  it("changes the valuation key when required vehicle fields change", () => {
    const a = blocketVehicleFingerprint(TNH357_VEHICLE);
    const b = blocketVehicleFingerprint({ ...TNH357_VEHICLE, mileage_mil: 12816 });
    expect(a).not.toEqual(b);
  });
});

describe("Blocket query building", () => {
  it("uses complete CRM vehicle fields as Blocket filters", () => {
    const q = buildSearchParams(TNH357_VEHICLE);
    expect(q.q).toBe("Volvo XC90 T8 AWD");
    expect(q.make).toBe("0.818");
    expect(q.year_from).toBe(2018);
    expect(q.year_to).toBe(2020);
    expect(q.milage_from).toBe(11255);
    expect(q.milage_to).toBe(17255);
    expect(q.transmission).toBe(2);
    expect(q.fuel).toBe(1352);
  });

  it("normalises human fuel/gearbox labels when building Blocket filters", () => {
    const q = buildSearchParams({
      ...TNH357_VEHICLE,
      fuel: "Plug-in Bensin / laddhybrid",
      gearbox: "Automat",
    });
    expect(q.transmission).toBe(2);
    expect(q.fuel).toBe(1352);
  });
});

describe("Blocket response parsing", () => {
  it("uses the listing array only, not recursive JSON scraping", () => {
    const comps = extractComps({
      stats: { average: { amount: 450000 } },
      promo: { price: 99000 },
      data: [{ ad_id: "1", subject: "Volvo XC90 T8", price: { amount: 350000 }, modelYear: 2019, mileage: 14000 }],
    });
    expect(comps).toHaveLength(1);
    expect(comps[0].price).toBe(350000);
  });

  it("locates repo fixture data key", () => {
    const located = locateListingArray(fixture);
    expect(located.key).toBe("data");
    expect(located.arr).toHaveLength(12);
  });

  it("detects seller field when available", () => {
    expect(detectSellerField([{ dealer_segment: "Företag" }])).toBe("dealer_segment");
    expect(detectSellerField([{ subject: "Volvo XC90", price: 123 }])).toBeNull();
  });
});

describe("comparable filtering", () => {
  it("rejects neighbouring Volvo models", () => {
    expect(titleMatchesModel("Volvo XC90 T8 AWD", "XC90")).toBe(true);
    expect(titleMatchesModel("Volvo XC 90 Recharge", "XC90")).toBe(true);
    expect(titleMatchesModel("Volvo XC60 Recharge T6", "XC90")).toBe(false);
    expect(titleMatchesModel("Volvo V60 Recharge", "XC90")).toBe(false);
  });

  it("filters by model/year/mileage", () => {
    const comps = extractComps(fixture);
    const comparable = filterToComparable(comps, TNH357_VEHICLE);
    expect(comparable).toHaveLength(6);
    expect(comparable.every((c) => titleMatchesModel(c.title, "XC90"))).toBe(true);
    expect(comparable.every((c) => Math.abs((c.mileage_mil ?? 0) - (TNH357_VEHICLE.mileage_mil ?? 0)) <= 3000)).toBe(true);
  });
});

describe("second-cheapest offer engine", () => {
  it("uses second cheapest minus band-based deduction", () => {
    const offer = calculateCustomerOffer([
      { price: 320000, title: "A" },
      { price: 333000, title: "B" },
      { price: 345000, title: "C" },
      { price: 360000, title: "D" },
    ]);
    expect(offer?.referencePrice).toBe(333000);
    expect(offer?.deduction).toBe(40000);
    expect(offer?.customerOffer).toBe(293000);
    expect(offer?.explanationText).toContain("näst lägsta");
    expect(offer?.explanationText).toContain("333 000 kr");
    expect(offer?.explanationText).toContain("40 000 kr");
    expect(offer?.explanationText).toContain("293 000 kr");
  });

  it("uses agreed margin bands", () => {
    expect(deductionForReference(190000).deduction).toBe(30000);
    expect(deductionForReference(333000).deduction).toBe(40000);
    expect(deductionForReference(500000).deduction).toBe(45000);
    expect(deductionForReference(800000).deduction).toBe(88000);
  });
});

describe("valuateWithBlocket", () => {
  it("values fixture using all comparable when seller type is unavailable", async () => {
    const r = await valuateWithBlocket(TNH357_VEHICLE, { fetcher: () => Promise.resolve(fixture) });
    expect(r.ok).toBe(true);
    expect(r.totalCount).toBe(12);
    expect(r.comparableCount).toBe(6);
    expect(r.sampleSize).toBe(6);
    expect(r.sellerTypeAvailable).toBe(false);
    expect(r.customerOffer?.referenceRank).toBe(2);
    expect(r.note).toMatch(/Handlare\/privat kunde inte särskiljas/);
  });

  it("uses dealer listings only when seller type is available", async () => {
    const mk = (i: number, seller: string, price = 380000 + i * 5000) => ({
      ad_id: String(i),
      subject: "Volvo XC90 T8 AWD",
      price: { amount: price },
      modelYear: 2019,
      mileage: 14000,
      dealer_segment: seller,
    });
    const r = await valuateWithBlocket(TNH357_VEHICLE, {
      fetcher: () => Promise.resolve({ data: [mk(1, "Företag"), mk(2, "Företag"), mk(3, "Företag"), mk(4, "Privat")] }),
    });
    expect(r.ok).toBe(true);
    expect(r.sellerTypeAvailable).toBe(true);
    expect(r.dealerCount).toBe(3);
    expect(r.privateCount).toBe(1);
    expect(r.comps.every((c) => c.isDealer === true)).toBe(true);
  });

  it("refuses bare brand/model leads", async () => {
    const r = await valuateWithBlocket({ brand: "Volvo", model: "XC90" }, { fetcher: () => Promise.resolve(fixture) });
    expect(r.ok).toBe(false);
    expect(r.note).toMatch(/obligatoriska biluppgifter/);
  });

  it("refuses wrong-model results", async () => {
    const r = await valuateWithBlocket(TNH357_VEHICLE, {
      fetcher: () => Promise.resolve({ data: [{ ad_id: "1", subject: "Volvo XC60 Recharge", price: { amount: 450000 }, modelYear: 2019, mileage: 14000 }] }),
    });
    expect(r.ok).toBe(false);
    expect(r.note).toMatch(/För få jämförbara/);
  });
});
