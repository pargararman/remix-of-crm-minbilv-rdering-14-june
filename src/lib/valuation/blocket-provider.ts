// Production Blocket valuation provider.
//
// Important production rules:
// - never recursively scrape arbitrary JSON for prices
// - parse only a detected listing array
// - hard-filter comparable cars locally by model/year/mileage
// - if seller type exists, value from dealer listings only
// - if seller type does not exist, use all comparable listings and say so
// - Utpris is lower-market dealer resale price; Inpris is Utpris minus margin/buffers

import { blocketMakeId } from "./blocket-brands";
import { calculateCustomerOffer } from "./engine";
import { blocketMissingFieldsText, isVehicleCompleteForBlocket } from "./vehicle-validation";
import type {
  BlocketComp,
  BlocketSearchParams,
  CompRef,
  CustomerOfferResult,
  ProviderOptions,
  ValuationResult,
  ValuationVehicle,
} from "./types";

const BLOCKET_SEARCH_URL =
  "https://www.blocket.se/mobility/search/api/search/SEARCH_ID_CAR_USED";

const DEFAULT_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Confirmed live 2026-06-17: Blocket mobility search returns listings in `docs`.
// The repo fixture uses `data`, so keep it second for offline tests.
export const LISTING_ARRAY_KEYS = [
  "docs",
  "data",
  "items",
  "results",
  "listings",
  "ads",
  "cars",
] as const;

const SELLER_FIELD_CANDIDATES = [
  "dealer_segment",
  "seller_type",
  "sellerType",
  "advertiser_type",
  "advertiserType",
  "ad_type",
  "adType",
  "owner_type",
  "ownerType",
  "type",
] as const;

const TRANSMISSION_CODE: Record<string, number> = {
  manuell: 1,
  manual: 1,
  manuel: 1,
  automatisk: 2,
  automat: 2,
  automatic: 2,
};

// Keys are normalized with `norm()` before lookup so both CRM enum values
// (`plugin_bensin`) and human labels (`Plug-in Bensin / laddhybrid`) work.
const FUEL_CODE: Record<string, number> = {
  bensin: 1,
  diesel: 2,
  el: 4,
  hybridbensin: 6,
  pluginbensin: 1352,
  pluginbensinladdhybrid: 1352,
  pluginhybridbensin: 1352,
  laddhybridbensin: 1352,
  plugindiesel: 1356,
  plugindieselladdhybrid: 1356,
  laddhybriddiesel: 1356,
};

const MIN_COMPARABLE = 3;
const TARGET_COMPARABLE = 5;
const MIN_AUTO_MARGIN = 15_000;

interface SearchStage {
  stage: number;
  label: string;
  yearFromOffset: number;
  yearToOffset: number;
  mileageBelow: number;
  mileageAbove: number;
  relaxVersion: boolean;
}

const SEARCH_STAGES: SearchStage[] = [
  {
    stage: 1,
    label: "Stage 1: same year to +2 years, -500 to +1 000 mil, strict filters",
    yearFromOffset: 0,
    yearToOffset: 2,
    mileageBelow: 500,
    mileageAbove: 1000,
    relaxVersion: false,
  },
  {
    stage: 2,
    label: "Stage 2: -1 to +2 years, -1 000 to +1 500 mil, strict filters",
    yearFromOffset: -1,
    yearToOffset: 2,
    mileageBelow: 1000,
    mileageAbove: 1500,
    relaxVersion: false,
  },
  {
    stage: 3,
    label: "Stage 3: -1 to +3 years, -1 500 to +2 000 mil, relaxed trim/version",
    yearFromOffset: -1,
    yearToOffset: 3,
    mileageBelow: 1500,
    mileageAbove: 2000,
    relaxVersion: true,
  },
  {
    stage: 4,
    label: "Stage 4: -2 to +3 years, -2 000 to +2 500 mil, relaxed trim/version",
    yearFromOffset: -2,
    yearToOffset: 3,
    mileageBelow: 2000,
    mileageAbove: 2500,
    relaxVersion: true,
  },
];

interface ComparableFilterOptions {
  yearFrom?: number | null;
  yearTo?: number | null;
  mileageFrom?: number | null;
  mileageTo?: number | null;
  relaxVersion?: boolean;
}

let shapeLogged = false;

function clampMin0(n: number): number {
  return n < 0 ? 0 : n;
}

function round100(n: number): number {
  return Math.round(n / 100) * 100;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/å/g, "a")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]/g, "");
}

function lookupCode(map: Record<string, number>, value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const raw = String(value).trim();
  return map[raw] ?? map[raw.toLowerCase()] ?? map[norm(raw)];
}

function versionSearchTerms(version: string | null | undefined): string {
  if (!version) return "";
  const upper = version.toUpperCase();
  const terms: string[] = [];
  const powertrain = upper.match(/\b(T[0-9]|D[0-9]|B[0-9])\b/);
  if (powertrain) terms.push(powertrain[1]);
  if (/\bAWD\b|\b4WD\b|FYRHJUL/.test(upper)) terms.push("AWD");
  if (/RECHARGE|LADDHYBRID|PLUG[ -]?IN/.test(upper)) terms.push("Recharge");
  return [...new Set(terms)].join(" ");
}

function driveSearchTerms(driveType: string | null | undefined): string {
  if (!driveType) return "";
  const d = String(driveType).toLowerCase();
  if (d.includes("fyrhjul") || d.includes("awd") || d.includes("4wd")) return "AWD";
  return "";
}

export function buildSearchParams(
  v: ValuationVehicle,
  opts: ProviderOptions = {},
): BlocketSearchParams {
  return buildSearchParamsForStage(v, SEARCH_STAGES[0], opts, true);
}

function buildSearchParamsForStage(
  v: ValuationVehicle,
  stage: SearchStage,
  _opts: ProviderOptions = {},
  includeMake = true,
): BlocketSearchParams {
  const qParts = [
    v.brand,
    v.model,
    stage.relaxVersion ? "" : versionSearchTerms(v.version),
    driveSearchTerms(v.drive_type),
  ]
    .filter((s): s is string => !!s && s.trim().length > 0)
    .flatMap((s) => s.trim().split(/\s+/));
  const hasYear = typeof v.year === "number" && v.year > 1900;
  const hasMileage = typeof v.mileage_mil === "number" && v.mileage_mil >= 0;
  const transmission = lookupCode(TRANSMISSION_CODE, v.gearbox);
  const fuel = lookupCode(FUEL_CODE, v.fuel);

  return {
    q: [...new Set(qParts)].join(" ").trim(),
    make: includeMake ? blocketMakeId(v.brand) : null,
    year_from: hasYear ? (v.year as number) + stage.yearFromOffset : null,
    year_to: hasYear ? (v.year as number) + stage.yearToOffset : null,
    milage_from: hasMileage ? clampMin0((v.mileage_mil as number) - stage.mileageBelow) : null,
    milage_to: hasMileage ? (v.mileage_mil as number) + stage.mileageAbove : null,
    transmission: transmission ?? null,
    fuel: fuel ?? null,
    page: 1,
    sort: "PRICE_ASC",
  };
}

export function hasEnoughVehicleSpec(v: ValuationVehicle): boolean {
  return isVehicleCompleteForBlocket(v);
}

export function toQueryString(p: BlocketSearchParams): string {
  const entries: [string, string | number][] = [];
  const push = (k: string, val: string | number | null | undefined) => {
    if (val === null || val === undefined || val === "") return;
    entries.push([k, val]);
  };
  push("q", p.q);
  push("make", p.make ?? undefined);
  push("year_from", p.year_from ?? undefined);
  push("year_to", p.year_to ?? undefined);
  push("milage_from", p.milage_from ?? undefined);
  push("milage_to", p.milage_to ?? undefined);
  push("transmission", p.transmission ?? undefined);
  push("fuel", p.fuel ?? undefined);
  push("page", p.page);
  push("sort", p.sort);
  return entries.map(([k, val]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(val))}`).join("&");
}

export class BlocketHttpError extends Error {
  status: number;
  url: string;
  responseSnippet: string;

  constructor(status: number, statusText: string, url: string, responseSnippet: string) {
    super(`Blocket responded ${status} ${statusText}. ${responseSnippet ? `Body: ${responseSnippet}` : ""}`.trim());
    this.name = "BlocketHttpError";
    this.status = status;
    this.url = url;
    this.responseSnippet = responseSnippet;
  }
}

async function liveFetcher(params: BlocketSearchParams, userAgent: string): Promise<unknown> {
  const url = `${BLOCKET_SEARCH_URL}?${toQueryString(params)}`;
  // Keep transport close to the previously working implementation.
  // Do not add browser-only headers unless diagnostics prove they are required;
  // some runtimes/CDNs treat forged Origin/Referer differently and can return 403.
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": userAgent,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const snippet = text.replace(/\s+/g, " ").slice(0, 500);
    console.error("[blocket] HTTP error", { status: res.status, statusText: res.statusText, url, snippet });
    throw new BlocketHttpError(res.status, res.statusText, url, snippet);
  }

  const payload = await res.json();
  logShapeOnce(payload, url);
  return payload;
}

function toNumber(x: unknown): number | null {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string") {
    const cleaned = x.replace(/[^\d]/g, "");
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function pickFirst(obj: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const k of keys) if (obj[k] != null) return obj[k];
  return undefined;
}

function priceFrom(raw: unknown): number | null {
  if (typeof raw === "number" || typeof raw === "string") return toNumber(raw);
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    return toNumber(pickFirst(o, ["amount", "value", "price"]));
  }
  return null;
}

function titleFrom(o: Record<string, unknown>): string | undefined {
  const parts = [
    o.subject,
    o.heading,
    o.facade_title,
    o.title,
    o.make,
    o.model,
    o.model_specification,
  ].filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  if (!parts.length) return undefined;
  return [...new Set(parts)].join(" ");
}

function urlFrom(o: Record<string, unknown>): string | null {
  const raw = pickFirst(o, ["share_url", "canonical_url", "url", "web_url"]);
  return typeof raw === "string" ? raw : null;
}

const DEALER_WORDS = ["store", "dealer", "company", "pro", "naringsidkare", "handlare", "foretag", "företag", "firma"];
const PRIVATE_WORDS = ["private", "privat"];

export function detectSellerField(items: unknown[]): string | null {
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const obj = item as Record<string, unknown>;
    for (const k of SELLER_FIELD_CANDIDATES) {
      if (obj[k] != null) return k;
    }
    if (obj.dealer || obj.store || obj.shop || typeof obj.private === "boolean" || typeof obj.is_dealer === "boolean") {
      return "nested/boolean";
    }
  }
  return null;
}

function detectDealer(obj: Record<string, unknown>): { isDealer: boolean | null; sellerType: string | null } {
  const rawType = pickFirst(obj, SELLER_FIELD_CANDIDATES);
  if (rawType != null) {
    const raw = String(rawType);
    const t = raw.toLowerCase();
    if (DEALER_WORDS.some((w) => t.includes(w))) return { isDealer: true, sellerType: raw };
    if (PRIVATE_WORDS.some((w) => t.includes(w))) return { isDealer: false, sellerType: raw };
    return { isDealer: null, sellerType: raw };
  }
  if (obj.dealer || obj.store || obj.shop) return { isDealer: true, sellerType: "store" };
  if (typeof obj.private === "boolean") return { isDealer: !obj.private, sellerType: obj.private ? "private" : "store" };
  if (typeof obj.is_dealer === "boolean") return { isDealer: obj.is_dealer, sellerType: obj.is_dealer ? "store" : "private" };
  return { isDealer: null, sellerType: null };
}

function looksLikeListing(item: unknown): boolean {
  if (!item || typeof item !== "object" || Array.isArray(item)) return false;
  const o = item as Record<string, unknown>;
  const price = priceFrom(pickFirst(o, ["price", "list_price", "amount", "value"]));
  return price != null && price >= 5_000 && price <= 5_000_000;
}

export function locateListingArray(payload: unknown): { key: string | null; arr: unknown[]; autoDetected: boolean } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { key: null, arr: [], autoDetected: false };
  const root = payload as Record<string, unknown>;

  for (const key of LISTING_ARRAY_KEYS) {
    const val = root[key];
    if (Array.isArray(val)) return { key, arr: val, autoDetected: false };
  }

  // Bounded top-level auto-detect only. This is not recursive scraping.
  let best: { key: string; arr: unknown[]; score: number } | null = null;
  for (const [key, val] of Object.entries(root)) {
    if (!Array.isArray(val) || val.length === 0) continue;
    const sample = val.slice(0, 20);
    const score = sample.filter(looksLikeListing).length / sample.length;
    if (score >= 0.6 && (!best || score > best.score || val.length > best.arr.length)) {
      best = { key, arr: val, score };
    }
  }
  return best ? { key: `auto:${best.key}`, arr: best.arr, autoDetected: true } : { key: null, arr: [], autoDetected: false };
}

function logShapeOnce(payload: unknown, url: string): void {
  const debug = process.env.BLOCKET_DEBUG === "true" || process.env.BLOCKET_DEBUG === "always";
  if (!debug) return;
  if (shapeLogged && process.env.BLOCKET_DEBUG !== "always") return;
  shapeLogged = true;
  const located = locateListingArray(payload);
  const first = located.arr.find((x) => x && typeof x === "object" && !Array.isArray(x)) as Record<string, unknown> | undefined;
  const sellerField = detectSellerField(located.arr);
  const topKeys = payload && typeof payload === "object" && !Array.isArray(payload) ? Object.keys(payload as Record<string, unknown>).slice(0, 40) : [];
  console.info("[blocket] response shape", {
    url,
    topKeys,
    listingKey: located.key,
    listingCount: located.arr.length,
    sellerField,
    firstItemKeys: first ? Object.keys(first).slice(0, 60) : [],
  });
}

function mapListing(item: unknown): BlocketComp | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const o = item as Record<string, unknown>;
  const price = priceFrom(pickFirst(o, ["price", "list_price", "amount", "value"]));
  if (price == null || price < 5_000 || price > 5_000_000) return null;
  const { isDealer, sellerType } = detectDealer(o);
  return {
    id:
      o.ad_id != null ? String(o.ad_id) :
      o.id != null ? String(o.id) :
      undefined,
    title: titleFrom(o),
    price,
    year: toNumber(pickFirst(o, ["modelYear", "model_year", "year", "regdate"])),
    mileage_mil: toNumber(pickFirst(o, ["mileage", "milage", "mileage_mil", "milage_mil"])),
    fuel: typeof o.fuel === "string" ? o.fuel : null,
    gearbox: typeof o.transmission === "string" ? o.transmission : null,
    url: urlFrom(o),
    sellerType,
    isDealer,
  };
}

export function extractComps(payload: unknown): BlocketComp[] {
  const located = locateListingArray(payload);
  const comps = located.arr.map(mapListing).filter((c): c is BlocketComp => !!c);
  const byKey = new Map<string, BlocketComp>();
  for (const c of comps) {
    const key = c.id ?? `${c.price}|${c.title ?? ""}|${c.year ?? ""}|${c.mileage_mil ?? ""}`;
    if (!byKey.has(key)) byKey.set(key, c);
  }
  return [...byKey.values()];
}

export function titleMatchesModel(title: string | null | undefined, model: string | null | undefined): boolean {
  if (!model?.trim()) return true;
  if (!title?.trim()) return false;
  const t = norm(title);
  const m = norm(model);
  if (!m) return true;
  if (t.includes(m)) return true;
  // Handle model written with inserted spaces in the ad title (XC 90 vs XC90).
  const spacedModel = model.replace(/([a-zA-Z]+)(\d+)/, "$1 $2");
  return t.includes(norm(spacedModel));
}

function versionPowertrainTokens(version: string | null | undefined): string[] {
  if (!version) return [];
  const v = version.toUpperCase();
  const tokens = v.match(/\b(T[0-9]|D[0-9]|B[0-9])\b/g) ?? [];
  return [...new Set(tokens.map(norm))];
}

function matchesFuel(vehicleFuel: string | null | undefined, comp: BlocketComp): boolean {
  if (!vehicleFuel) return true;
  const wanted = norm(vehicleFuel);
  const hay = norm(`${comp.fuel ?? ""} ${comp.title ?? ""}`);
  if (!hay) return true;

  if (wanted === "pluginbensin") {
    return hay.includes("pluginbensin") || hay.includes("plugin") || hay.includes("laddhybrid") ||
      hay.includes("elhybridbensin") || hay.includes("recharge") || hay.includes("t8") || hay.includes("t6");
  }
  if (wanted === "plugindiesel") {
    return hay.includes("plugindiesel") || hay.includes("laddhybriddiesel");
  }
  if (wanted === "diesel") return hay.includes("diesel") || hay.includes("d4") || hay.includes("d5");
  if (wanted === "bensin") return hay.includes("bensin") || hay.includes("t4") || hay.includes("t5") || hay.includes("t6");
  if (wanted === "el") return hay.includes("el") || hay.includes("electric");
  return true;
}

function matchesGearbox(vehicleGearbox: string | null | undefined, comp: BlocketComp): boolean {
  if (!vehicleGearbox) return true;
  const wanted = norm(vehicleGearbox);
  const hay = norm(`${comp.gearbox ?? ""} ${comp.title ?? ""}`);
  // If Blocket does not expose gearbox/listing text, avoid false negatives.
  if (!hay) return true;
  const listingMentionsGearbox =
    hay.includes("automat") || hay.includes("automatic") || hay.includes("manuell") || hay.includes("manual");
  if (!listingMentionsGearbox) return true;

  if (wanted.includes("automat")) return hay.includes("automat") || hay.includes("automatic");
  if (wanted.includes("manuell") || wanted.includes("manual")) return hay.includes("manuell") || hay.includes("manual");
  return true;
}

function matchesDriveType(vehicleDriveType: string | null | undefined, comp: BlocketComp): boolean {
  if (!vehicleDriveType) return true;
  const wanted = norm(vehicleDriveType);
  const hay = norm(comp.title ?? "");
  if (!hay) return true;

  const titleMentionsDrive =
    hay.includes("awd") || hay.includes("4wd") || hay.includes("fyrhjul") ||
    hay.includes("framhjul") || hay.includes("bakhjul");
  if (!titleMentionsDrive) return true;

  if (wanted.includes("fyrhjul") || wanted.includes("awd") || wanted.includes("4wd")) {
    return hay.includes("awd") || hay.includes("4wd") || hay.includes("fyrhjul");
  }
  if (wanted.includes("framhjul")) return hay.includes("framhjul");
  if (wanted.includes("bakhjul")) return hay.includes("bakhjul");
  return true;
}

function matchesBodyType(vehicleBodyType: string | null | undefined, comp: BlocketComp): boolean {
  if (!vehicleBodyType) return true;
  const wanted = norm(vehicleBodyType);
  const hay = norm(comp.title ?? "");
  if (!hay) return true;

  const bodyWords = [
    "kombi",
    "combi",
    "wagon",
    "touring",
    "sedan",
    "suv",
    "cab",
    "cabriolet",
    "coupe",
    "halvkombi",
    "hatchback",
  ];
  if (!bodyWords.some((w) => hay.includes(w))) return true;

  if (wanted.includes("kombi")) return hay.includes("kombi") || hay.includes("combi") || hay.includes("wagon") || hay.includes("touring");
  if (wanted.includes("suv")) return hay.includes("suv") || hay.includes("xc") || hay.includes("xdrive");
  if (wanted.includes("sedan")) return hay.includes("sedan");
  if (wanted.includes("cab")) return hay.includes("cab") || hay.includes("cabriolet");
  if (wanted.includes("coupe")) return hay.includes("coupe");
  if (wanted.includes("halvkombi")) return hay.includes("halvkombi") || hay.includes("hatchback");
  return true;
}

function matchesHorsepower(vehicleHp: number | null | undefined, comp: BlocketComp): boolean {
  if (typeof vehicleHp !== "number" || !Number.isFinite(vehicleHp) || vehicleHp <= 0) return true;
  const title = comp.title ?? "";
  const powerMatches = [...title.matchAll(/\b([1-9][0-9]{1,2})\s*(?:hk|hp)\b/gi)]
    .map((m) => Number(m[1]))
    .filter((n) => Number.isFinite(n));
  if (powerMatches.length === 0) return true;
  return powerMatches.some((hp) => Math.abs(hp - vehicleHp) <= Math.max(15, vehicleHp * 0.12));
}

const NON_COMPARABLE_WORDS = [
  "defekt",
  "repobjekt",
  "reparationsobjekt",
  "skadad",
  "krock",
  "krockad",
  "motorproblem",
  "vaxelladsproblem",
  "reservdel",
  "export",
  "momsbil export",
  "leasingovertagande",
  "leasingoverlatelse",
  "privatleasing",
  "finansiering fran",
  "endast foretag",
];

function nonComparableReason(comp: BlocketComp): string | null {
  const hay = norm(`${comp.title ?? ""} ${comp.url ?? ""}`);
  for (const word of NON_COMPARABLE_WORDS) {
    if (hay.includes(norm(word))) return `Annonsen verkar inte vara jämförbar (${word}).`;
  }
  return null;
}

function priceOutlierReason(comp: BlocketComp, prices: number[]): string | null {
  if (prices.length < 3) return null;
  const sorted = [...prices].sort((a, b) => a - b);
  const med = median(sorted);
  if (!Number.isFinite(med) || med <= 0) return null;

  const q1 = percentile(sorted, 0.25);
  const q3 = percentile(sorted, 0.75);
  const iqr = q3 - q1;
  const iqrLower = iqr > 0 ? q1 - iqr * 1.5 : med * 0.65;
  const iqrUpper = iqr > 0 ? q3 + iqr * 1.5 : med * 1.45;
  const lower = Math.max(5_000, Math.max(iqrLower, med * 0.6));
  const upper = Math.min(5_000_000, Math.min(iqrUpper, med * 1.5));

  if (comp.price < lower) return `Pris ${comp.price} kr ligger orimligt lågt mot median ${round100(med)} kr.`;
  if (comp.price > upper) return `Pris ${comp.price} kr ligger orimligt högt mot median ${round100(med)} kr.`;
  return null;
}

function cleanComparableListings(comps: BlocketComp[]): { valid: BlocketComp[]; removed: { comp: BlocketComp; reason: string }[] } {
  const removed: { comp: BlocketComp; reason: string }[] = [];
  const textCleaned: BlocketComp[] = [];
  for (const comp of comps) {
    const reason = nonComparableReason(comp);
    if (reason) removed.push({ comp, reason });
    else textCleaned.push(comp);
  }

  const prices = textCleaned.map((c) => c.price);
  const valid: BlocketComp[] = [];
  for (const comp of textCleaned) {
    const reason = priceOutlierReason(comp, prices);
    if (reason) removed.push({ comp, reason });
    else valid.push(comp);
  }

  return { valid: valid.sort((a, b) => a.price - b.price), removed };
}

export function filterToComparable(
  comps: BlocketComp[],
  vehicle: ValuationVehicle,
  opts: ProviderOptions & ComparableFilterOptions = {},
): BlocketComp[] {
  const hasYear = typeof vehicle.year === "number" && vehicle.year > 1900;
  const hasMileage = typeof vehicle.mileage_mil === "number" && vehicle.mileage_mil >= 0;
  const defaultStage = SEARCH_STAGES[0];
  const yearFrom = opts.yearFrom ?? (hasYear ? (vehicle.year as number) + defaultStage.yearFromOffset : null);
  const yearTo = opts.yearTo ?? (hasYear ? (vehicle.year as number) + defaultStage.yearToOffset : null);
  const mileageFrom = opts.mileageFrom ?? (hasMileage ? clampMin0((vehicle.mileage_mil as number) - defaultStage.mileageBelow) : null);
  const mileageTo = opts.mileageTo ?? (hasMileage ? (vehicle.mileage_mil as number) + defaultStage.mileageAbove : null);
  const requiredPowertrainTokens = opts.relaxVersion ? [] : versionPowertrainTokens(vehicle.version);

  return comps.filter((c) => {
    if (!titleMatchesModel(c.title, vehicle.model)) return false;
    if (requiredPowertrainTokens.length > 0) {
      const title = norm(c.title ?? "");
      if (!requiredPowertrainTokens.some((t) => title.includes(t))) return false;
    }
    if (!matchesFuel(vehicle.fuel, c)) return false;
    if (!matchesGearbox(vehicle.gearbox, c)) return false;
    if (!matchesDriveType(vehicle.drive_type, c)) return false;
    if (!matchesBodyType(vehicle.body_type, c)) return false;
    if (!matchesHorsepower(vehicle.horsepower, c)) return false;
    if (hasYear) {
      if (typeof c.year !== "number") return false;
      if (typeof yearFrom === "number" && c.year < yearFrom) return false;
      if (typeof yearTo === "number" && c.year > yearTo) return false;
    }
    if (hasMileage) {
      if (typeof c.mileage_mil !== "number") return false;
      if (typeof mileageFrom === "number" && c.mileage_mil < mileageFrom) return false;
      if (typeof mileageTo === "number" && c.mileage_mil > mileageTo) return false;
    }
    return true;
  });
}

export function median(sortedAsc: number[]): number {
  if (sortedAsc.length === 0) return NaN;
  const mid = Math.floor(sortedAsc.length / 2);
  return sortedAsc.length % 2 ? sortedAsc[mid] : (sortedAsc[mid - 1] + sortedAsc[mid]) / 2;
}

export function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return NaN;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] * (1 - (idx - lo)) + sortedAsc[hi] * (idx - lo);
}

function toRef(c: BlocketComp): CompRef {
  return { price: round100(c.price), title: c.title, url: c.url ?? null };
}

function offerToResult(offer: NonNullable<ReturnType<typeof calculateCustomerOffer>>): CustomerOfferResult {
  return {
    referencePrice: offer.referencePrice,
    referenceRank: offer.referenceRank,
    referenceListing: toRef(offer.referenceListing),
    deduction: offer.deduction,
    deductionBand: offer.deductionBand,
    customerOffer: offer.customerOffer,
    customerLow: offer.customerLow,
    customerHigh: offer.customerHigh,
    dealerOutPrice: offer.dealerOutPrice,
    dealerMarginTarget: offer.dealerMarginTarget,
    reconditioningBuffer: offer.reconditioningBuffer,
    riskBuffer: offer.riskBuffer,
    adminTransportBuffer: offer.adminTransportBuffer,
    negotiationBuffer: offer.negotiationBuffer,
    totalDeduction: offer.totalDeduction,
    lowerMarketPrice: offer.lowerMarketPrice,
    marketMedian: offer.marketMedian,
    confidenceLevel: offer.confidenceLevel,
    customerSmsText: offer.customerSmsText,
    explanationText: offer.explanationText,
  };
}

type StageEvaluation = {
  stage: SearchStage;
  params: BlocketSearchParams;
  located: ReturnType<typeof locateListingArray>;
  sellerField: string | null;
  all: BlocketComp[];
  comparable: BlocketComp[];
  dealers: BlocketComp[];
  privateCount: number;
  sellerTypeAvailable: boolean;
  used: BlocketComp[];
  removed: { comp: BlocketComp; reason: string }[];
  removedCount: number;
  makeFilterRemoved?: boolean;
};

function emptyValuation(note: string, query: BlocketSearchParams, diagnostics?: ValuationResult["diagnostics"]): ValuationResult {
  return {
    ok: false,
    totalCount: 0,
    comparableCount: 0,
    dealerCount: 0,
    privateCount: 0,
    sellerTypeAvailable: false,
    sampleSize: 0,
    offerMedian: null,
    marketMedian: null,
    marketLow: null,
    marketHigh: null,
    lowerMarketPrice: null,
    utpris: null,
    removedCount: 0,
    fallbackStage: null,
    searchAttempts: [],
    cheapest: null,
    mostExpensive: null,
    customerOffer: null,
    confidence: 0,
    confidenceLevel: "low",
    dealerAttractivenessScore: 0,
    sanityChecks: { passed: false, blockers: [note], warnings: [] },
    smsEligible: false,
    query,
    note,
    comps: [],
    diagnostics,
  };
}

function summarizeAttempt(e: StageEvaluation): ValuationResult["searchAttempts"][number] {
  return {
    stage: e.stage.stage,
    label: e.stage.label,
    query: e.params,
    totalCount: e.all.length,
    comparableCount: e.comparable.length,
    dealerCount: e.dealers.length,
    privateCount: e.privateCount,
    validCount: e.used.length,
    removedCount: e.removedCount,
    sellerTypeAvailable: e.sellerTypeAvailable,
    relaxedVersion: e.stage.relaxVersion,
    makeFilterRemoved: e.makeFilterRemoved,
  };
}

function betterEvaluation(a: StageEvaluation | null, b: StageEvaluation): StageEvaluation {
  if (!a) return b;
  if (b.used.length !== a.used.length) return b.used.length > a.used.length ? b : a;
  if (b.sellerTypeAvailable !== a.sellerTypeAvailable) return b.sellerTypeAvailable ? b : a;
  return b.stage.stage < a.stage.stage ? b : a;
}

function confidenceFor(e: StageEvaluation, marketLow: number | null, marketHigh: number | null) {
  const spread = marketHigh && marketHigh > 0 && marketLow != null ? (marketHigh - marketLow) / marketHigh : 1;
  let level: ValuationResult["confidenceLevel"] = "low";
  if (e.used.length >= 5 && e.stage.stage === 1 && e.sellerTypeAvailable && spread <= 0.25) {
    level = "high";
  } else if (e.used.length >= 3 && e.stage.stage <= 3 && e.sellerTypeAvailable && spread <= 0.4) {
    level = "medium";
  }
  const sampleScore = Math.min(1, e.used.length / 8);
  const stagePenalty = [0, 0, 0.08, 0.18, 0.32][e.stage.stage] ?? 0.32;
  const sellerPenalty = e.sellerTypeAvailable ? 0 : 0.25;
  const spreadPenalty = Math.min(0.35, Math.max(0, spread - 0.18));
  const score = Math.max(0, Math.min(1, sampleScore - stagePenalty - sellerPenalty - spreadPenalty));
  return { level, score: Number(score.toFixed(2)), spread };
}

function vehicleDataBlockers(vehicle: ValuationVehicle): string[] {
  const blockers: string[] = [];
  const currentYear = new Date().getFullYear();
  if (typeof vehicle.year !== "number" || vehicle.year < 1950 || vehicle.year > currentYear + 1) {
    blockers.push("Årsmodell saknas eller är orimlig.");
  }
  if (typeof vehicle.mileage_mil !== "number" || vehicle.mileage_mil <= 0 || vehicle.mileage_mil > 80_000) {
    blockers.push("Miltal saknas eller är orimligt.");
  }
  if (!isVehicleCompleteForBlocket(vehicle)) blockers.push(blocketMissingFieldsText(vehicle));
  return blockers;
}

function runSanityChecks(args: {
  vehicle: ValuationVehicle;
  evaluation: StageEvaluation;
  offer: CustomerOfferResult;
  confidenceLevel: ValuationResult["confidenceLevel"];
  spread: number;
}): ValuationResult["sanityChecks"] {
  const blockers = vehicleDataBlockers(args.vehicle);
  const warnings: string[] = [];
  const offerWidth = args.offer.customerHigh - args.offer.customerLow;
  const marginAtHighOffer = args.offer.referencePrice - args.offer.customerHigh;

  if (args.offer.customerHigh >= args.offer.referencePrice) blockers.push("Inpris är högre än eller lika med Utpris.");
  if (marginAtHighOffer < MIN_AUTO_MARGIN) blockers.push(`Marginal efter högsta Inpris är för låg (${round100(marginAtHighOffer)} kr).`);
  if (args.evaluation.used.length < MIN_COMPARABLE) blockers.push("Färre än 3 giltiga jämförbara annonser användes.");
  if (!args.evaluation.sellerTypeAvailable) blockers.push("Blocket-svaret kunde inte säkert särskilja handlarannonser från privatannonser.");
  if (args.confidenceLevel === "low") blockers.push("Värderingsförtroende är Low.");
  if (args.evaluation.stage.stage >= 4) blockers.push("Väldigt bred fallback användes.");
  if (offerWidth > Math.max(10_000, args.offer.customerOffer * 0.06)) blockers.push("Inpris-spannet är för brett.");
  if (args.spread > 0.45) blockers.push("Prisbilden mellan jämförbara annonser är för spretig.");
  if (args.evaluation.removed.length > 0) warnings.push(`${args.evaluation.removed.length} annonser togs bort vid rensning/outlier-kontroll.`);
  if (args.evaluation.stage.stage > 1) warnings.push(`Fallback stage ${args.evaluation.stage.stage} användes.`);

  return { passed: blockers.length === 0, blockers, warnings };
}

function dealerAttractivenessScore(args: {
  sampleSize: number;
  confidenceLevel: ValuationResult["confidenceLevel"];
  marginAtHighOffer: number;
  utpris: number;
  fallbackStage: number;
  spread: number;
}): number {
  const confidenceBase = args.confidenceLevel === "high" ? 35 : args.confidenceLevel === "medium" ? 24 : 8;
  const sample = Math.min(25, args.sampleSize * 4);
  const marginRatio = args.utpris > 0 ? args.marginAtHighOffer / args.utpris : 0;
  const margin = Math.max(0, Math.min(25, marginRatio * 150));
  const stage = Math.max(0, 15 - (args.fallbackStage - 1) * 4);
  const spreadPenalty = Math.min(20, args.spread * 40);
  return Math.round(Math.max(0, Math.min(100, confidenceBase + sample + margin + stage - spreadPenalty)));
}

export async function valuateWithBlocket(
  vehicle: ValuationVehicle,
  opts: ProviderOptions = {},
): Promise<ValuationResult> {
  const firstParams = buildSearchParams(vehicle, opts);
  const minComparable = opts.minComparable ?? (opts.allowSingleComparable ? 1 : MIN_COMPARABLE);

  if (!firstParams.q) return emptyValuation("Saknar märke/modell – kan inte söka jämförbara annonser.", firstParams);
  if (!hasEnoughVehicleSpec(vehicle)) {
    return emptyValuation(blocketMissingFieldsText(vehicle), firstParams);
  }

  const fetcher = (p: BlocketSearchParams) =>
    opts.fetcher ? opts.fetcher(p) : liveFetcher(p, opts.userAgent ?? DEFAULT_UA);

  const evaluate = async (stage: SearchStage, includeMake: boolean, makeFilterRemoved = false): Promise<StageEvaluation> => {
    const params = buildSearchParamsForStage(vehicle, stage, opts, includeMake);
    const payload = await fetcher(params);
    const located = locateListingArray(payload);
    const all = extractComps(payload);
    const comparable = filterToComparable(all, vehicle, {
      ...opts,
      yearFrom: params.year_from,
      yearTo: params.year_to,
      mileageFrom: params.milage_from,
      mileageTo: params.milage_to,
      relaxVersion: stage.relaxVersion,
    }).sort((a, b) => a.price - b.price);
    const sellerField = detectSellerField(located.arr) ?? detectSellerField(comparable);
    const sellerTypeAvailable = sellerField != null || comparable.some((c) => c.isDealer !== null && c.isDealer !== undefined);
    const dealers = comparable.filter((c) => c.isDealer === true);
    const privateCount = comparable.filter((c) => c.isDealer === false).length;
    const sellerFiltered = sellerTypeAvailable ? dealers : comparable;
    const cleaned = cleanComparableListings(sellerFiltered);
    const removedCount = cleaned.removed.length + (sellerTypeAvailable ? Math.max(0, comparable.length - dealers.length) : 0);
    return {
      stage,
      params,
      located,
      sellerField,
      all,
      comparable,
      dealers,
      privateCount,
      sellerTypeAvailable,
      used: cleaned.valid,
      removed: cleaned.removed,
      removedCount,
      makeFilterRemoved,
    };
  };

  const attempts: ValuationResult["searchAttempts"] = [];
  let best: StageEvaluation | null = null;
  let selected: StageEvaluation | null = null;

  for (const stage of SEARCH_STAGES) {
    let evaluation: StageEvaluation;
    try {
      evaluation = await evaluate(stage, true);
      if (evaluation.all.length === 0 && evaluation.params.make && !opts.fetcher) {
        evaluation = await evaluate(stage, false, true);
      }
    } catch (err) {
      if (err instanceof BlocketHttpError) {
        const note = err.status === 403
          ? "Blocket returnerade 403 Forbidden. Troligen blockeras servermiljön/IP-adressen eller så kräver endpointen webbläsarsession/cookies."
          : `Blocket-anrop misslyckades: ${err.message}`;
        const result = emptyValuation(note, buildSearchParamsForStage(vehicle, stage, opts, true), {
          httpStatus: err.status,
          url: err.url,
          responseSnippet: err.responseSnippet,
        });
        result.searchAttempts = attempts;
        return result;
      }
      const result = emptyValuation(
        `Blocket-anrop misslyckades: ${err instanceof Error ? err.message : String(err)}`,
        buildSearchParamsForStage(vehicle, stage, opts, true),
      );
      result.searchAttempts = attempts;
      return result;
    }

    attempts.push(summarizeAttempt(evaluation));
    best = betterEvaluation(best, evaluation);
    if (evaluation.used.length >= TARGET_COMPARABLE) {
      selected = evaluation;
      break;
    }
  }

  selected = selected ?? best;
  if (!selected) {
    const result = emptyValuation("Inga Blocket-sökningar kunde genomföras.", firstParams);
    result.searchAttempts = attempts;
    return result;
  }

  const { all, comparable, dealers, privateCount, sellerTypeAvailable, sellerField, located } = selected;
  const used = [...selected.used].sort((a, b) => a.price - b.price);
  const sellerNote = sellerTypeAvailable
    ? `Blocket exponerade säljartyp (${sellerField ?? "okänt fält"}). Värderingen använder endast ${dealers.length} jämförbara handlarannonser; ${privateCount} privatannonser exkluderades.`
    : `Handlare/privat kunde inte särskiljas i Blocket-svaret. Resultatet kan visas internt men blockeras från auto-SMS.`;

  if (used.length < minComparable) {
    const result = emptyValuation(
      `För få giltiga jämförbara annonser efter fallback: ${used.length} använda av ${all.length} träffar. ${sellerNote}`,
      selected.params,
      { listingKey: located.key, sellerField },
    );
    return {
      ...result,
      totalCount: all.length,
      comparableCount: comparable.length,
      dealerCount: dealers.length,
      privateCount,
      sellerTypeAvailable,
      sampleSize: used.length,
      removedCount: selected.removedCount,
      fallbackStage: selected.stage.stage,
      searchAttempts: attempts,
      comps: used,
    };
  }

  const prices = used.map((c) => c.price).sort((a, b) => a - b);
  const marketMedian = round100(median(prices));
  const marketLow = round100(percentile(prices, 0.25));
  const marketHigh = round100(percentile(prices, 0.75));
  const confidence = confidenceFor(selected, marketLow, marketHigh);
  const offer = calculateCustomerOffer(used, {
    marginAmount: opts.marginAmount,
    allowSingleListing: opts.allowSingleComparable,
    reconditioningBuffer: opts.reconditioningBuffer,
    riskBuffer: opts.riskBuffer,
    adminTransportBuffer: opts.adminTransportBuffer,
    negotiationBuffer: opts.negotiationBuffer,
    confidenceLevel: confidence.level,
    marketMedian,
  });
  if (!offer) {
    const result = emptyValuation("Kunde inte räkna ut Inpris från jämförbara annonser.", selected.params);
    result.searchAttempts = attempts;
    return result;
  }

  const offerResult = offerToResult(offer);
  const sanityChecks = runSanityChecks({
    vehicle,
    evaluation: selected,
    offer: offerResult,
    confidenceLevel: confidence.level,
    spread: confidence.spread,
  });
  const marginAtHighOffer = offerResult.referencePrice - offerResult.customerHigh;
  const dealerScore = dealerAttractivenessScore({
    sampleSize: used.length,
    confidenceLevel: confidence.level,
    marginAtHighOffer,
    utpris: offerResult.referencePrice,
    fallbackStage: selected.stage.stage,
    spread: confidence.spread,
  });
  const smsEligible =
    sanityChecks.passed &&
    (confidence.level === "high" || confidence.level === "medium") &&
    offerResult.customerHigh < offerResult.referencePrice;

  return {
    ok: true,
    totalCount: all.length,
    comparableCount: comparable.length,
    dealerCount: dealers.length,
    privateCount,
    sellerTypeAvailable,
    sampleSize: used.length,
    offerMedian: offer.customerOffer,
    marketMedian,
    marketLow,
    marketHigh,
    lowerMarketPrice: offer.lowerMarketPrice,
    utpris: offer.referencePrice,
    removedCount: selected.removedCount,
    fallbackStage: selected.stage.stage,
    searchAttempts: attempts,
    cheapest: toRef(used[0]),
    mostExpensive: toRef(used[used.length - 1]),
    customerOffer: offerResult,
    confidence: confidence.score,
    confidenceLevel: confidence.level,
    dealerAttractivenessScore: dealerScore,
    sanityChecks,
    smsEligible,
    query: selected.params,
    note:
      `${sellerNote} Fallback stage ${selected.stage.stage} användes. ` +
      `Utpris ${offer.referencePrice.toLocaleString("sv-SE")} kr baseras på lägre marknadspris; ` +
      `Inpris ${offer.customerLow.toLocaleString("sv-SE")}–${offer.customerHigh.toLocaleString("sv-SE")} kr. ` +
      `Confidence: ${confidence.level}.` +
      (sanityChecks.blockers.length > 0 ? ` Auto-SMS blockerat: ${sanityChecks.blockers.join(" ")}` : ""),
    comps: used,
    diagnostics: { listingKey: located.key, sellerField },
  };
}
