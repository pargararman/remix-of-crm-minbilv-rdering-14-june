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
import { mapBiluppgifterVehicle } from "../src/lib/biluppgifter.server";
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
    expect(called).toBe(3);
    expect(r.ok).toBe(true);
    expect(r.fallbackStage).toBe(3);
  });

  it("changes the valuation key when required vehicle fields change", () => {
    const a = blocketVehicleFingerprint(TNH357_VEHICLE);
    const b = blocketVehicleFingerprint({ ...TNH357_VEHICLE, mileage_mil: 12816 });
    expect(a).not.toEqual(b);
  });
});

describe("Biluppgifter CRM mapping", () => {
  it("maps Swedish vehicle response fields into CRM valuation fields", () => {
    const r = mapBiluppgifterVehicle({
      vehicle: {
        regnr: "TNH357",
        vin: "YV1LFBMUDK1432465",
        make: "Volvo",
        market_name: "XC90",
        variant: "T8 Polestar AWD",
        model_year: 2019,
        meter: 142550,
        transmission: "Automat",
        exterior_color: "Grå",
        no_users: 4,
        technical: {
          four_wheel_drive: true,
          electric_vehicle_configuration: "Laddhybrid",
          chassi: ["Kombi"],
          drive: [
            { fuel: "Bensin", power_hp: 303 },
            { fuel: "El", power_hp: 87 },
          ],
        },
      },
    });

    expect(r.ok).toBe(true);
    expect(r.patch).toMatchObject({
      brand: "Volvo",
      model: "XC90",
      version: "T8 Polestar AWD",
      year: 2019,
      mileage_mil: 14255,
      fuel: "plugin_bensin",
      gearbox: "automatisk",
      drive_type: "fyrhjulsdrift",
      body_type: "suv",
      horsepower: 303,
    });
  });

  it("maps explicit non-AWD Biluppgifter vehicles as two-wheel drive when axle side is unknown", () => {
    const r = mapBiluppgifterVehicle({
      vehicle: {
        regnr: "DFP56K",
        make: "Skoda",
        model: "Octavia IV Combi",
        market_name: "Škoda Octavia IV Combi (NX5, PV5) 1.4 TSI RS IV",
        model_year: 2021,
        meter: 85297,
        transmission: "Automat",
        technical: {
          electric_vehicle_configuration: "Laddhybrid",
          four_wheel_drive: false,
          chassi: ["StationsvagnKombivagn"],
          drive: [
            { fuel: "Bensin", power_hp: 149 },
            { fuel: "El", power_hp: 108 },
          ],
        },
        power_hp: 245,
      },
    });

    expect(r.ok).toBe(true);
    expect(r.patch).toMatchObject({
      fuel: "plugin_bensin",
      gearbox: "automatisk",
      drive_type: "tvahjulsdriven",
      body_type: "kombi",
      horsepower: 245,
    });
  });
});

describe("Blocket query building", () => {
  it("uses complete CRM vehicle fields as Blocket filters", () => {
    const q = buildSearchParams(TNH357_VEHICLE);
    expect(q.q).toBe("Volvo XC90 T8 AWD");
    expect(q.make).toBe("0.818");
    expect(q.year_from).toBe(2019);
    expect(q.year_to).toBe(2021);
    expect(q.milage_from).toBe(13755);
    expect(q.milage_to).toBe(15255);
    expect(q.transmission).toBe(2);
    expect(q.fuel).toBe(1352);
    expect(q.sort).toBe("PRICE_ASC");
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
    expect(comparable).toHaveLength(2);
    expect(comparable.every((c) => titleMatchesModel(c.title, "XC90"))).toBe(true);
    expect(comparable.every((c) => (c.year ?? 0) >= 2019 && (c.year ?? 0) <= 2021)).toBe(true);
    expect(comparable.every((c) => (c.mileage_mil ?? 0) >= 13755 && (c.mileage_mil ?? 0) <= 15255)).toBe(true);
  });
});

describe("dealer-safe offer engine", () => {
  it("uses lower-market Utpris minus margin and operating buffers", () => {
    const offer = calculateCustomerOffer([
      { price: 320000, title: "A" },
      { price: 333000, title: "B" },
      { price: 345000, title: "C" },
      { price: 360000, title: "D" },
      { price: 390000, title: "E" },
    ]);
    expect(offer?.referencePrice).toBe(333000);
    expect(offer?.dealerMarginTarget).toBe(40000);
    expect(offer?.reconditioningBuffer).toBe(4000);
    expect(offer?.riskBuffer).toBe(2000);
    expect(offer?.adminTransportBuffer).toBe(1000);
    expect(offer?.negotiationBuffer).toBe(1000);
    expect(offer?.deduction).toBe(48000);
    expect(offer?.customerOffer).toBe(285000);
    expect(offer?.customerLow).toBe(283000);
    expect(offer?.customerHigh).toBe(288000);
    expect(offer?.customerSmsText).toContain("handlarnätverk");
    expect(offer?.customerSmsText).not.toContain("333 000");
    expect(offer?.explanationText).toContain("Utpris");
    expect(offer?.explanationText).toContain("333 000 kr");
    expect(offer?.explanationText).toContain("48 000 kr");
    expect(offer?.explanationText).toContain("285 000 kr");
  });

  it("uses agreed margin bands", () => {
    expect(deductionForReference(190000).deduction).toBe(30000);
    expect(deductionForReference(333000).deduction).toBe(40000);
    expect(deductionForReference(500000).deduction).toBe(45000);
    expect(deductionForReference(800000).deduction).toBe(88000);
  });

  it("uses configured fixed margin when provided", () => {
    const offer = calculateCustomerOffer(
      [
        { price: 320000, title: "A" },
        { price: 333000, title: "B" },
        { price: 345000, title: "C" },
        { price: 360000, title: "D" },
        { price: 390000, title: "E" },
      ],
      { marginAmount: 55000 },
    );
    expect(offer?.referencePrice).toBe(333000);
    expect(offer?.dealerMarginTarget).toBe(55000);
    expect(offer?.deduction).toBe(63000);
    expect(offer?.customerOffer).toBe(270000);
    expect(offer?.deductionBand).toContain("admininställd bruttomarginal");
  });

  it("can fall back to the cheapest listing when explicitly allowed", () => {
    const offer = calculateCustomerOffer([{ price: 320000, title: "A" }], {
      marginAmount: 40000,
      allowSingleListing: true,
    });
    expect(offer?.referenceRank).toBe(1);
    expect(offer?.referencePrice).toBe(320000);
    expect(offer?.customerOffer).toBe(272000);
    expect(offer?.explanationText).toContain("billigaste giltiga annonsen");
  });
});

describe("valuateWithBlocket", () => {
  it("values fixture using all comparable when seller type is unavailable", async () => {
    const r = await valuateWithBlocket(TNH357_VEHICLE, { fetcher: () => Promise.resolve(fixture) });
    expect(r.ok).toBe(true);
    expect(r.totalCount).toBe(12);
    expect(r.comparableCount).toBe(5);
    expect(r.sampleSize).toBe(5);
    expect(r.fallbackStage).toBe(3);
    expect(r.searchAttempts.map((a) => a.validCount)).toEqual([2, 3, 5]);
    expect(r.sellerTypeAvailable).toBe(false);
    expect(r.customerOffer?.referenceRank).toBe(3);
    expect(r.confidenceLevel).toBe("low");
    expect(r.smsEligible).toBe(false);
    expect(r.sanityChecks.blockers).toEqual(
      expect.arrayContaining(["Blocket-svaret kunde inte säkert särskilja handlarannonser från privatannonser."]),
    );
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

  it("allows automatic SMS for high-confidence dealer-safe valuations", async () => {
    const mk = (i: number, price: number) => ({
      ad_id: String(i),
      subject: "Volvo XC90 T8 AWD",
      price: { amount: price },
      modelYear: 2019,
      mileage: 14200 + i * 20,
      dealer_segment: "Företag",
    });
    const r = await valuateWithBlocket(TNH357_VEHICLE, {
      fetcher: () => Promise.resolve({ data: [mk(1, 200000), mk(2, 205000), mk(3, 210000), mk(4, 215000), mk(5, 220000)] }),
    });

    expect(r.ok).toBe(true);
    expect(r.fallbackStage).toBe(1);
    expect(r.confidenceLevel).toBe("high");
    expect(r.smsEligible).toBe(true);
    expect(r.customerOffer?.referencePrice).toBe(205000);
    expect(r.customerOffer?.customerLow).toBe(155000);
    expect(r.customerOffer?.customerHigh).toBe(160000);
  });

  it("allows conservative medium-confidence valuations from 3 dealer comparables", async () => {
    const mk = (i: number, price: number) => ({
      ad_id: String(i),
      subject: "Volvo XC90 T8 AWD",
      price: { amount: price },
      modelYear: 2019,
      mileage: 14200 + i * 20,
      dealer_segment: "Företag",
    });
    const r = await valuateWithBlocket(TNH357_VEHICLE, {
      fetcher: () => Promise.resolve({ data: [mk(1, 200000), mk(2, 205000), mk(3, 210000)] }),
    });

    expect(r.ok).toBe(true);
    expect(r.sampleSize).toBe(3);
    expect(r.confidenceLevel).toBe("medium");
    expect(r.smsEligible).toBe(true);
  });

  it("creates internal review-only pricing when fewer than 3 comparables remain", async () => {
    const oneDealer = {
      data: [
        {
          ad_id: "1",
          subject: "Volvo XC90 T8 AWD",
          price: { amount: 399000 },
          modelYear: 2019,
          mileage: 14000,
          dealer_segment: "Företag",
        },
      ],
    };
    const r = await valuateWithBlocket(TNH357_VEHICLE, { fetcher: () => Promise.resolve(oneDealer) });
    expect(r.ok).toBe(true);
    expect(r.valuationStatus).toBe("needs_review_with_price");
    expect(r.confidenceLevel).toBe("low");
    expect(r.smsEligible).toBe(false);
    expect(r.customerOffer?.referencePrice).toBe(379000);
    expect(r.customerOffer?.customerOffer).toBe(331000);
    expect(r.sanityChecks.blockers).toEqual(expect.arrayContaining(["Färre än 3 giltiga jämförbara annonser användes."]));
  });

  it("removes damaged/non-comparable ads before pricing", async () => {
    const mk = (i: number, price: number, suffix = "") => ({
      ad_id: String(i),
      subject: `Volvo XC90 T8 AWD ${suffix}`.trim(),
      price: { amount: price },
      modelYear: 2019,
      mileage: 14200 + i * 20,
      dealer_segment: "Företag",
    });
    const r = await valuateWithBlocket(TNH357_VEHICLE, {
      fetcher: () => Promise.resolve({
        data: [
          mk(1, 120000, "defekt"),
          mk(2, 200000),
          mk(3, 205000),
          mk(4, 210000),
          mk(5, 215000),
          mk(6, 220000),
        ],
      }),
    });

    expect(r.ok).toBe(true);
    expect(r.sampleSize).toBe(5);
    expect(r.removedCount).toBe(1);
    expect(r.customerOffer?.referencePrice).toBe(205000);
  });

  it("keeps one-listing pricing review-only even when fallback mode is enabled", async () => {
    const oneDealer = {
      data: [
        {
          ad_id: "1",
          subject: "Volvo XC90 T8 AWD",
          price: { amount: 399000 },
          modelYear: 2019,
          mileage: 14000,
          dealer_segment: "Företag",
        },
      ],
    };
    const blocked = await valuateWithBlocket(TNH357_VEHICLE, { fetcher: () => Promise.resolve(oneDealer) });
    expect(blocked.ok).toBe(true);
    expect(blocked.valuationStatus).toBe("needs_review_with_price");
    expect(blocked.smsEligible).toBe(false);

    const allowed = await valuateWithBlocket(TNH357_VEHICLE, {
      fetcher: () => Promise.resolve(oneDealer),
      allowSingleComparable: true,
      marginAmount: 50000,
    });
    expect(allowed.ok).toBe(true);
    expect(allowed.customerOffer?.referenceRank).toBe(1);
    expect(allowed.customerOffer?.referencePrice).toBe(379000);
    expect(allowed.customerOffer?.customerOffer).toBe(321000);
    expect(allowed.confidenceLevel).toBe("low");
    expect(allowed.smsEligible).toBe(false);
    expect(allowed.valuationStatus).toBe("needs_review_with_price");
    expect(allowed.note).toMatch(/Auto-SMS blockerat/);
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
    expect(r.valuationStatus).toBe("needs_review_no_price");
    expect(r.note).toMatch(/För få användbara jämförbara/);
  });
});
