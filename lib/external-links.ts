// Delade hjälpare för car.info / Blocket / biluppgifter-länkar.
import { blocketBrandSlug } from "./brands";

const DEFAULT_CAR_INFO = "https://www.car.info/sv-se/license-plate/S/{REGNR}";
const DEFAULT_BILUPPGIFTER = "https://biluppgifter.se/fordon/{REGNR}";
const BLOCKET_BASE = "https://www.blocket.se/mobility/search/car";

export interface VehicleLike {
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  mileage_mil?: number | null;
  fuel?: string | null;
  gearbox?: string | null;
  drive_type?: string | null;
  body_type?: string | null;
}

export function cleanRegnr(regnr: string | null | undefined): string | null {
  if (!regnr) return null;
  const cleaned = regnr.toUpperCase().replace(/[\s-]/g, "").replace(/[^A-Z0-9]/g, "");
  if (cleaned.length < 2 || cleaned.length > 10) return null;
  return cleaned;
}

export function buildCarInfoUrl(regnr: string | null | undefined, pattern?: string | null): string | null {
  const cleaned = cleanRegnr(regnr);
  if (!cleaned) return null;
  return (pattern || DEFAULT_CAR_INFO).replace("{REGNR}", encodeURIComponent(cleaned));
}

export function buildBiluppgifterUrl(regnr: string | null | undefined, pattern?: string | null): string | null {
  const cleaned = cleanRegnr(regnr);
  if (!cleaned) return null;
  return (pattern || DEFAULT_BILUPPGIFTER).replace("{REGNR}", encodeURIComponent(cleaned));
}

export function blocketReady(v: VehicleLike | null | undefined): boolean {
  if (!v) return false;
  const hasNameParts = !!(v.brand && v.model);
  const hasYear = typeof v.year === "number" && v.year > 1900;
  const hasMileage = typeof v.mileage_mil === "number" && v.mileage_mil >= 0;
  return hasNameParts || hasYear || hasMileage;
}

// Söktermer-mappningar — svenska ord som Blockets fritext-sök förstår.
const FUEL_TERM: Record<string, string> = {
  bensin: "bensin", diesel: "diesel", el: "el", etanol: "etanol",
  fordonsgas: "fordonsgas",
  hybrid_bensin: "hybrid bensin", hybrid_diesel: "hybrid diesel", hybrid_gas: "hybrid gas",
  plugin_bensin: "plug-in bensin", plugin_diesel: "plug-in diesel",
};
const GEARBOX_TERM: Record<string, string> = {
  automatisk: "automat", manuell: "manuell", sekventiell: "sekventiell",
};
const DRIVE_TERM: Record<string, string> = {
  fyrhjulsdrift: "fyrhjulsdrift", bakhjulsdrift: "bakhjulsdrift",
};
const BODY_TERM: Record<string, string> = {
  cabriolet: "cabriolet", pickup: "pickup",
};

// Blocket structured-filter codes (verified from blocket.se URLs).
// Leave entries undefined for fuels/gearboxes whose Blocket code we
// haven't verified yet — buildBlocketUrl falls back to the text term
// in `q` for those.
const BLOCKET_FUEL_CODE: Record<string, number | undefined> = {
  bensin: 1,
  diesel: 2,
  el: 4,
  hybrid_bensin: 6,
  plugin_bensin: 1352,
  plugin_diesel: 1356,
  // etanol: undefined,
  // fordonsgas: undefined,
  // hybrid_diesel: undefined,
  // hybrid_gas: undefined,
};

const BLOCKET_TRANSMISSION_CODE: Record<string, number | undefined> = {
  manuell: 1,
  automatisk: 2,
  // sekventiell: undefined,
};

function smartYearRange(year: number): { from: number; to: number } {
  return { from: year - 2, to: year + 2 };
}

function smartMileageRange(m: number): { from: number; to: number } {
  return { from: Math.max(0, m - 2000), to: m + 2000 };
}

function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

export function buildBlocketUrl(
  v: VehicleLike | null | undefined,
  pattern?: string | null,
): string | null {
  if (!blocketReady(v) || !v) return null;

  const yr =
    typeof v.year === "number" && v.year > 1900
      ? smartYearRange(v.year)
      : null;
  const ml =
    typeof v.mileage_mil === "number" && v.mileage_mil >= 0
      ? smartMileageRange(v.mileage_mil)
      : null;

  // Resolve structured codes
  const fuelCode = v.fuel ? BLOCKET_FUEL_CODE[String(v.fuel)] : undefined;
  const transmissionCode = v.gearbox
    ? BLOCKET_TRANSMISSION_CODE[String(v.gearbox)]
    : undefined;

  // Build the text query, but skip fuel/gearbox words if we have a structured
  // code for them (avoid double-filtering — listing text won't always match).
  const qParts = [
    v.brand,
    v.model,
    fuelCode === undefined ? (FUEL_TERM[String(v.fuel ?? "")] ?? "") : "",
    transmissionCode === undefined
      ? (GEARBOX_TERM[String(v.gearbox ?? "")] ?? "")
      : "",
    DRIVE_TERM[String(v.drive_type ?? "")] ?? "",
    BODY_TERM[String(v.body_type ?? "")] ?? "",
  ].filter((s) => s && String(s).trim().length > 0);
  const q = qParts.join(" ");

  if (pattern && pattern.trim()) {
    const slug = blocketBrandSlug(v.brand) ?? "";
    return pattern
      .replace("{Q}", encodeURIComponent(q))
      .replace("{BRAND_SLUG}", encodeURIComponent(slug))
      .replace("{BRAND}", encodeURIComponent(v.brand ?? ""))
      .replace("{MODEL}", encodeURIComponent(v.model ?? ""))
      .replace("{YEAR_FROM}", yr ? String(yr.from) : "")
      .replace("{YEAR_TO}", yr ? String(yr.to) : "")
      .replace("{MILEAGE_FROM}", ml ? String(ml.from) : "")
      .replace("{MILEAGE_TO}", ml ? String(ml.to) : "")
      .replace("{FUEL}", FUEL_TERM[String(v.fuel ?? "")] ?? "")
      .replace("{GEARBOX}", GEARBOX_TERM[String(v.gearbox ?? "")] ?? "")
      .replace("{WHEEL_DRIVE}", DRIVE_TERM[String(v.drive_type ?? "")] ?? "");
  }

  return `${BLOCKET_BASE}${buildQuery({
    q: q || undefined,
    fuel: fuelCode,
    transmission: transmissionCode,
    year_from: yr?.from,
    year_to: yr?.to,
    mileage_from: ml?.from,
    mileage_to: ml?.to,
  })}`;
}
