// Production Blocket valuation provider.
//
// Important production rules:
// - never recursively scrape arbitrary JSON for prices
// - parse only a detected listing array
// - hard-filter comparable cars locally by model/year/mileage
// - if seller type exists, value from dealer listings only
// - if seller type does not exist, use all comparable listings and say so
// - customer offer is second-cheapest comparable listing minus configured margin

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

const DEFAULT_YEAR_BAND = 1;
const DEFAULT_MILEAGE_BAND_MIL = 3000;
const MIN_COMPARABLE = 2;

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
  const yearBand = opts.yearBand ?? DEFAULT_YEAR_BAND;
  const mileageBandMil = opts.mileageBandMil ?? DEFAULT_MILEAGE_BAND_MIL;
  const qParts = [v.brand, v.model, versionSearchTerms(v.version), driveSearchTerms(v.drive_type)]
    .filter((s): s is string => !!s && s.trim().length > 0)
    .flatMap((s) => s.trim().split(/\s+/));
  const hasYear = typeof v.year === "number" && v.year > 1900;
  const hasMileage = typeof v.mileage_mil === "number" && v.mileage_mil >= 0;
  const transmission = lookupCode(TRANSMISSION_CODE, v.gearbox);
  const fuel = lookupCode(FUEL_CODE, v.fuel);

  return {
    q: [...new Set(qParts)].join(" ").trim(),
    make: blocketMakeId(v.brand),
    year_from: hasYear ? (v.year as number) - yearBand : null,
    year_to: hasYear ? (v.year as number) + yearBand : null,
    milage_from: hasMileage ? clampMin0((v.mileage_mil as number) - mileageBandMil) : null,
    milage_to: hasMileage ? (v.mileage_mil as number) + mileageBandMil : null,
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

export function filterToComparable(
  comps: BlocketComp[],
  vehicle: ValuationVehicle,
  opts: ProviderOptions = {},
): BlocketComp[] {
  const yearBand = opts.yearBand ?? DEFAULT_YEAR_BAND;
  const mileageBandMil = opts.mileageBandMil ?? DEFAULT_MILEAGE_BAND_MIL;
  const hasYear = typeof vehicle.year === "number" && vehicle.year > 1900;
  const hasMileage = typeof vehicle.mileage_mil === "number" && vehicle.mileage_mil >= 0;
  const requiredPowertrainTokens = versionPowertrainTokens(vehicle.version);

  return comps.filter((c) => {
    if (!titleMatchesModel(c.title, vehicle.model)) return false;
    if (requiredPowertrainTokens.length > 0) {
      const title = norm(c.title ?? "");
      if (!requiredPowertrainTokens.some((t) => title.includes(t))) return false;
    }
    if (!matchesFuel(vehicle.fuel, c)) return false;
    if (!matchesGearbox(vehicle.gearbox, c)) return false;
    if (!matchesDriveType(vehicle.drive_type, c)) return false;
    if (hasYear) {
      if (typeof c.year !== "number") return false;
      if (Math.abs(c.year - (vehicle.year as number)) > yearBand) return false;
    }
    if (hasMileage) {
      if (typeof c.mileage_mil !== "number") return false;
      if (Math.abs(c.mileage_mil - (vehicle.mileage_mil as number)) > mileageBandMil) return false;
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
    explanationText: offer.explanationText,
  };
}

export async function valuateWithBlocket(
  vehicle: ValuationVehicle,
  opts: ProviderOptions = {},
): Promise<ValuationResult> {
  const params = buildSearchParams(vehicle, opts);
  let activeParams = params;
  const minComparable = opts.minComparable ?? (opts.allowSingleComparable ? 1 : MIN_COMPARABLE);

  const empty = (note: string, diagnostics?: ValuationResult["diagnostics"]): ValuationResult => ({
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
    cheapest: null,
    mostExpensive: null,
    customerOffer: null,
    confidence: 0,
    query: activeParams,
    note,
    comps: [],
    diagnostics,
  });

  if (!params.q) return empty("Saknar märke/modell – kan inte söka jämförbara annonser.");
  if (!hasEnoughVehicleSpec(vehicle)) {
    return empty(blocketMissingFieldsText(vehicle));
  }

  let payload: unknown;
  try {
    const fetcher = (p: BlocketSearchParams) =>
      opts.fetcher ? opts.fetcher(p) : liveFetcher(p, opts.userAgent ?? DEFAULT_UA);
    payload = await fetcher(activeParams);
  } catch (err) {
    if (err instanceof BlocketHttpError) {
      const note = err.status === 403
        ? "Blocket returnerade 403 Forbidden. Troligen blockeras servermiljön/IP-adressen eller så kräver endpointen webbläsarsession/cookies."
        : `Blocket-anrop misslyckades: ${err.message}`;
      return empty(note, { httpStatus: err.status, url: err.url, responseSnippet: err.responseSnippet });
    }
    return empty(`Blocket-anrop misslyckades: ${err instanceof Error ? err.message : String(err)}`);
  }

  let located = locateListingArray(payload);
  let all = extractComps(payload);
  if (all.length === 0 && params.make && !opts.fetcher) {
    activeParams = { ...params, make: null };
    try {
      payload = await liveFetcher(activeParams, opts.userAgent ?? DEFAULT_UA);
      located = locateListingArray(payload);
      all = extractComps(payload);
    } catch (err) {
      if (err instanceof BlocketHttpError) {
        const note = err.status === 403
          ? "Blocket returnerade 403 Forbidden. Troligen blockeras servermiljön/IP-adressen eller så kräver endpointen webbläsarsession/cookies."
          : `Blocket-anrop misslyckades: ${err.message}`;
        return empty(note, { httpStatus: err.status, url: err.url, responseSnippet: err.responseSnippet });
      }
      return empty(`Blocket-anrop misslyckades: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (all.length === 0) {
    return empty("Inga Blocket-annonser kunde läsas från svaret.", { listingKey: located.key, sellerField: detectSellerField(located.arr) });
  }

  const comparable = filterToComparable(all, vehicle, opts).sort((a, b) => a.price - b.price);
  const sellerField = detectSellerField(comparable);
  const sellerTypeAvailable = sellerField != null || comparable.some((c) => c.isDealer !== null && c.isDealer !== undefined);
  const dealers = comparable.filter((c) => c.isDealer === true);
  const privateCount = comparable.filter((c) => c.isDealer === false).length;

  let used: BlocketComp[];
  let note: string;
  if (sellerTypeAvailable) {
    used = dealers;
    note = `Blocket exponerade säljartyp (${sellerField ?? "okänt fält"}). Värderingen använder endast ${dealers.length} jämförbara handlarannonser; ${privateCount} privatannonser exkluderades.`;
  } else {
    used = comparable;
    note = `Handlare/privat kunde inte särskiljas i Blocket-svaret. Värderingen använder därför alla ${comparable.length} jämförbara annonser.`;
  }

  used = [...used].sort((a, b) => a.price - b.price);
  if (used.length < minComparable) {
    return {
      ...empty(`För få jämförbara annonser efter filtrering: ${used.length} använda av ${all.length} träffar. ${note}`, {
        listingKey: located.key,
        sellerField,
      }),
      totalCount: all.length,
      comparableCount: comparable.length,
      dealerCount: dealers.length,
      privateCount,
      sellerTypeAvailable,
      comps: used,
    };
  }

  const prices = used.map((c) => c.price).sort((a, b) => a - b);
  const offer = calculateCustomerOffer(used, {
    marginAmount: opts.marginAmount,
    allowSingleListing: opts.allowSingleComparable,
  });
  if (!offer) return empty("Kunde inte räkna ut kundvärdering från jämförbara annonser.");

  const marketMedian = round100(median(prices));
  const marketLow = round100(percentile(prices, 0.25));
  const marketHigh = round100(percentile(prices, 0.75));
  const spread = marketHigh > 0 ? (marketHigh - marketLow) / marketHigh : 1;
  const sizeScore = Math.min(1, used.length / 12);
  const confidence = Number((0.65 * sizeScore + 0.35 * Math.max(0, 1 - spread)).toFixed(2));

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
    cheapest: toRef(used[0]),
    mostExpensive: toRef(used[used.length - 1]),
    customerOffer: offerToResult(offer),
    confidence,
    query: activeParams,
    note:
      `${note} Referenspriset är ${
        offer.referenceRank === 1 ? "den lägsta tillgängliga" : "den näst lägsta"
      } jämförbara annonsen; median används endast som marknadskontext.` +
      (offer.referenceRank === 1 ? " Endast en annons användes, så leadet bör granskas manuellt." : ""),
    comps: used,
    diagnostics: { listingKey: located.key, sellerField },
  };
}
