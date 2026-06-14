// Blocket valuation provider.
//
// Values a car from comparable LIVE Blocket listings. Pipeline:
//   fetch comps -> keep DEALER ads only -> sort cheapest first -> trim outliers
//   -> median of the cheapest N = conservative buy-in (offerMedian),
//   plus marketMedian (all dealers) + cheapest/most-expensive for context.
//
// Transport: Blocket's car-search endpoint needs no API key, only a realistic
// User-Agent. Plain server-side HTTPS GET. Keep this SERVER-SIDE (unofficial
// endpoint, and a browser call would be CORS-blocked).

import { blocketMakeId } from "./blocket-brands";
import type {
  BlocketComp,
  BlocketSearchParams,
  CompRef,
  ProviderOptions,
  ValuationResult,
  ValuationVehicle,
} from "./types";

const BLOCKET_SEARCH_URL =
  "https://www.blocket.se/mobility/search/api/search/SEARCH_ID_CAR_USED";

const DEFAULT_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const TRANSMISSION_CODE: Record<string, number> = {
  manuell: 1,
  automatisk: 2,
};

const DEALER_SAMPLE = 15; // median the cheapest 15 dealer ads
const OUTLIER_FLOOR = 0.65; // drop ads under 65% of the dealer median
const MIN_DEALERS = 8; // below this, fall back to all comps

function clampMin0(n: number): number {
  return n < 0 ? 0 : n;
}

export function buildSearchParams(
  v: ValuationVehicle,
  opts: ProviderOptions = {},
): BlocketSearchParams {
  const yearBand = opts.yearBand ?? 1;
  const mileageBandMil = opts.mileageBandMil ?? 3000;

  const qParts = [v.brand, v.model].filter(
    (s): s is string => !!s && s.trim().length > 0,
  );
  const q = qParts.join(" ").trim();

  const hasYear = typeof v.year === "number" && v.year > 1900;
  const hasMileage = typeof v.mileage_mil === "number" && v.mileage_mil >= 0;
  const transmission = v.gearbox ? TRANSMISSION_CODE[String(v.gearbox)] : undefined;

  return {
    q,
    make: blocketMakeId(v.brand),
    year_from: hasYear ? (v.year as number) - yearBand : null,
    year_to: hasYear ? (v.year as number) + yearBand : null,
    milage_from: hasMileage
      ? clampMin0((v.mileage_mil as number) - mileageBandMil)
      : null,
    milage_to: hasMileage ? (v.mileage_mil as number) + mileageBandMil : null,
    transmission: transmission ?? null,
    page: 1,
    sort: "price", // ask Blocket for cheapest-first; we also sort locally
  };
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
  push("page", p.page);
  push("sort", p.sort);
  return entries
    .map(([k, val]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(val))}`)
    .join("&");
}

async function liveFetcher(
  params: BlocketSearchParams,
  userAgent: string,
): Promise<unknown> {
  const url = `${BLOCKET_SEARCH_URL}?${toQueryString(params)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { "User-Agent": userAgent, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Blocket responded ${res.status} ${res.statusText}`);
  return res.json();
}

// --- Defensive parsing -----------------------------------------------------

function toNumber(x: unknown): number | null {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string") {
    const cleaned = x.replace(/[^\d]/g, "");
    if (cleaned.length === 0) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const PRICE_KEYS = ["price", "list_price", "amount", "value"];
const YEAR_KEYS = ["modelYear", "model_year", "year", "regdate"];
const MILEAGE_KEYS = ["mileage", "milage", "mileage_mil", "milage_mil"];
const SELLER_KEYS = ["seller_type", "sellerType", "ad_type", "type", "advertiser_type"];

function pickFirst(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) if (k in obj && obj[k] != null) return obj[k];
  return undefined;
}

function extractPrice(
  node: Record<string, unknown>,
  consumed: Set<unknown>,
): number | null {
  const raw = pickFirst(node, PRICE_KEYS);
  if (raw == null) return null;
  if (typeof raw === "object") {
    const inner = raw as Record<string, unknown>;
    consumed.add(raw);
    return toNumber(pickFirst(inner, ["amount", "value", "price"]));
  }
  return toNumber(raw);
}

const DEALER_WORDS = ["store", "dealer", "company", "pro", "naringsidkare", "handlare", "foretag"];
const PRIVATE_WORDS = ["private", "privat"];

/**
 * Detect dealer vs private from whatever Blocket returns. Returns true (dealer),
 * false (private), or null (no seller info on this listing).
 */
function detectDealer(obj: Record<string, unknown>): { isDealer: boolean | null; sellerType: string | null } {
  // 1) explicit seller-type string
  const rawType = pickFirst(obj, SELLER_KEYS);
  if (typeof rawType === "string") {
    const t = rawType.toLowerCase();
    if (DEALER_WORDS.some((w) => t.includes(w))) return { isDealer: true, sellerType: rawType };
    if (PRIVATE_WORDS.some((w) => t.includes(w))) return { isDealer: false, sellerType: rawType };
  }
  // 2) nested dealer/store object
  if (obj.dealer || obj.store || obj.shop) return { isDealer: true, sellerType: "store" };
  // 3) boolean private flag
  if (typeof obj.private === "boolean") return { isDealer: !obj.private, sellerType: obj.private ? "private" : "store" };
  if (typeof obj.is_dealer === "boolean") return { isDealer: obj.is_dealer, sellerType: obj.is_dealer ? "store" : "private" };
  return { isDealer: null, sellerType: null };
}

/**
 * Map one Blocket `docs` entry to a comp. Blocket's real shape (verified live):
 *   { ad_id, heading, model_specification, price:{amount}, year, mileage,
 *     mileage_unit:"SCANDINAVIAN_MILE", dealer_segment:"Företag"|"Privat",
 *     canonical_url }
 */
function mapDoc(d: Record<string, unknown>): BlocketComp | null {
  const priceObj = d.price as Record<string, unknown> | number | undefined;
  let price: number | null = null;
  if (typeof priceObj === "number") price = priceObj;
  else if (priceObj && typeof priceObj === "object") price = toNumber(priceObj.amount);
  if (price == null || price < 1000 || price > 5_000_000) return null;

  const seg = typeof d.dealer_segment === "string" ? d.dealer_segment.toLowerCase() : "";
  const isDealer = seg.includes("företag") || seg.includes("foretag")
    ? true
    : seg.includes("privat")
      ? false
      : null;

  const heading = typeof d.heading === "string" ? d.heading : "";
  const spec = typeof d.model_specification === "string" ? d.model_specification : "";
  const title =
    (heading && spec ? `${heading} ${spec}` : "") ||
    (typeof d.facade_title === "string" && d.facade_title) ||
    heading ||
    undefined;

  return {
    id: d.ad_id != null ? String(d.ad_id) : d.id != null ? String(d.id) : undefined,
    title: title || undefined,
    price,
    year: toNumber(d.year),
    mileage_mil: toNumber(d.mileage), // unit SCANDINAVIAN_MILE == mil, no conversion
    url: typeof d.canonical_url === "string" ? d.canonical_url : null,
    sellerType: typeof d.dealer_segment === "string" ? d.dealer_segment : null,
    isDealer,
  };
}

/** Collect car-listing comps. Prefers Blocket's `docs` array; falls back to a
 * defensive recursive scan for unknown shapes. */
export function extractComps(payload: unknown): BlocketComp[] {
  // Primary path: real Blocket response keeps listings in `docs`.
  if (payload && typeof payload === "object" && Array.isArray((payload as Record<string, unknown>).docs)) {
    const docs = (payload as Record<string, unknown>).docs as Record<string, unknown>[];
    const mapped: BlocketComp[] = [];
    for (const d of docs) {
      if (d && typeof d === "object") {
        const c = mapDoc(d);
        if (c) mapped.push(c);
      }
    }
    if (mapped.length > 0) return mapped;
  }

  // Fallback: recursive scan (older / unknown shapes).
  const comps: BlocketComp[] = [];
  const seen = new Set<unknown>();
  const consumed = new Set<unknown>();

  const visit = (node: unknown) => {
    if (node == null || typeof node !== "object") return;
    if (seen.has(node) || consumed.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }

    const obj = node as Record<string, unknown>;
    const price = extractPrice(obj, consumed);
    if (price != null && price >= 5000 && price <= 5_000_000) {
      const { isDealer, sellerType } = detectDealer(obj);
      comps.push({
        id:
          (typeof obj.ad_id === "string" && obj.ad_id) ||
          (typeof obj.id === "string" && obj.id) ||
          undefined,
        title:
          (typeof obj.subject === "string" && obj.subject) ||
          (typeof obj.title === "string" && obj.title) ||
          (typeof obj.heading === "string" && obj.heading) ||
          undefined,
        price,
        year: toNumber(pickFirst(obj, YEAR_KEYS)),
        mileage_mil: toNumber(pickFirst(obj, MILEAGE_KEYS)),
        url:
          (typeof obj.share_url === "string" && obj.share_url) ||
          (typeof obj.url === "string" && obj.url) ||
          null,
        sellerType,
        isDealer,
      });
    }

    for (const val of Object.values(obj)) if (val && typeof val === "object") visit(val);
  };

  visit(payload);
  const byKey = new Map<string, BlocketComp>();
  for (const c of comps) {
    const key = c.id ?? `${c.price}|${c.title ?? ""}`;
    if (!byKey.has(key)) byKey.set(key, c);
  }
  return [...byKey.values()];
}

// --- Statistics ------------------------------------------------------------

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

function round100(n: number): number {
  return Math.round(n / 100) * 100;
}

function toRef(c: BlocketComp): CompRef {
  return { price: round100(c.price), title: c.title, url: c.url ?? null };
}

// --- Public entry point ----------------------------------------------------

export async function valuateWithBlocket(
  vehicle: ValuationVehicle,
  opts: ProviderOptions = {},
): Promise<ValuationResult> {
  const sampleSize = opts.sampleSize ?? DEALER_SAMPLE;
  const outlierFloor = opts.outlierFloor ?? OUTLIER_FLOOR;
  const params = buildSearchParams(vehicle, opts);

  const empty = (note: string): ValuationResult => ({
    ok: false,
    dealerCount: 0,
    sampleSize: 0,
    offerMedian: null,
    marketMedian: null,
    marketLow: null,
    marketHigh: null,
    cheapest: null,
    mostExpensive: null,
    confidence: 0,
    query: params,
    note,
    comps: [],
  });

  if (!params.q) return empty("Saknar märke/modell – kan inte söka jämförbara annonser.");

  let payload: unknown;
  try {
    const fetcher = opts.fetcher
      ? () => opts.fetcher!(params)
      : () => liveFetcher(params, opts.userAgent ?? DEFAULT_UA);
    payload = await fetcher();
  } catch (err) {
    return empty(`Blocket-anrop misslyckades: ${err instanceof Error ? err.message : String(err)}`);
  }

  const all = extractComps(payload);
  if (all.length === 0) return empty("Inga jämförbara annonser hittades.");

  // 1) DEALER FILTER (fall back to all comps if too few dealers / no seller info).
  let note: string | undefined;
  const dealers = all.filter((c) => c.isDealer === true);
  let used: BlocketComp[];
  if (dealers.length >= MIN_DEALERS) {
    used = dealers;
  } else {
    used = all;
    note =
      dealers.length === 0
        ? "Inga handlarannonser kunde identifieras – visar alla."
        : "Få handlarannonser – visar alla.";
  }

  // 2) SORT cheapest first.
  used = [...used].sort((a, b) => a.price - b.price);

  // 3) OUTLIER TRIM: drop ads under outlierFloor * median of the used set.
  const medianAll = median(used.map((c) => c.price));
  const trimmed = used.filter((c) => c.price >= medianAll * outlierFloor);
  const finalSet = trimmed.length > 0 ? trimmed : used;

  // 4) SAMPLE = cheapest N. 5) offerMedian = median of sample.
  const sample = finalSet.slice(0, sampleSize);
  const samplePrices = sample.map((c) => c.price);
  const offerMedian = round100(median(samplePrices));

  // 6) marketMedian = median of ALL dealer/used comps (after trim).
  const marketMedian = round100(median(finalSet.map((c) => c.price)));

  // P25–P75 of the used set (kept for the pricing apply range).
  const allPrices = finalSet.map((c) => c.price).sort((a, b) => a - b);
  const marketLow = round100(percentile(allPrices, 0.25));
  const marketHigh = round100(percentile(allPrices, 0.75));

  // 7) cheapest / most expensive of the used set.
  const cheapest = toRef(finalSet[0]);
  const mostExpensive = toRef(finalSet[finalSet.length - 1]);

  // Confidence proxy.
  const sizeScore = Math.min(1, finalSet.length / 20);
  const spread = marketHigh > 0 ? (marketHigh - marketLow) / marketHigh : 1;
  const confidence = Number((0.6 * sizeScore + 0.4 * Math.max(0, 1 - spread)).toFixed(2));

  return {
    ok: true,
    dealerCount: finalSet.length,
    sampleSize: sample.length,
    offerMedian,
    marketMedian,
    marketLow,
    marketHigh,
    cheapest,
    mostExpensive,
    confidence,
    query: params,
    note,
    comps: finalSet,
  };
}
