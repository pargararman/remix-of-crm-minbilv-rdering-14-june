// Blocket valuation provider (built from scratch).
//
// What it does: values a car from the asking prices of comparable LIVE Blocket
// listings. Asking price is a market signal, not a sold price -- so we take the
// inter-quartile (25th-75th percentile) band of comps and apply a small
// asking->sold discount to estimate a realistic market range. That range can
// then feed the CRM's existing margin/pricing engine to produce a customer offer.
//
// Transport: Blocket's car-search endpoint needs no API key and no token -- only
// a realistic User-Agent header. It is a plain HTTPS GET, so this runs as a
// normal server-side fetch (Cloudflare/TanStack backend). No Python needed; the
// dunderrrrrr/blocket_api repo was only a reference for the request shape.
//
// IMPORTANT: keep this SERVER-SIDE. It is an unofficial endpoint that can change
// or rate-limit, and a browser call would be blocked by CORS anyway.

import { blocketMakeId } from "./blocket-brands";
import type {
  BlocketComp,
  BlocketSearchParams,
  ProviderOptions,
  ValuationResult,
  ValuationVehicle,
} from "./types";

const BLOCKET_SEARCH_URL =
  "https://www.blocket.se/mobility/search/api/search/SEARCH_ID_CAR_USED";

const DEFAULT_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// CRM gearbox enum -> Blocket transmission code.
const TRANSMISSION_CODE: Record<string, number> = {
  manuell: 1,
  automatisk: 2,
};

function clampMin0(n: number): number {
  return n < 0 ? 0 : n;
}

/** Build the normalised Blocket search params for a vehicle + bands. */
export function buildSearchParams(
  v: ValuationVehicle,
  opts: ProviderOptions = {},
): BlocketSearchParams {
  const yearBand = opts.yearBand ?? 1;
  const mileageBandMil = opts.mileageBandMil ?? 3000; // 3000 mil = 30 000 km

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
    sort: "price",
  };
}

/** Turn normalised params into a query string for the live endpoint. */
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

/** Default live fetcher: a single server-side HTTPS GET to Blocket. */
async function liveFetcher(
  params: BlocketSearchParams,
  userAgent: string,
): Promise<unknown> {
  const url = `${BLOCKET_SEARCH_URL}?${toQueryString(params)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": userAgent,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Blocket responded ${res.status} ${res.statusText}`);
  }
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

function pickFirst(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (k in obj && obj[k] != null) return obj[k];
  }
  return undefined;
}

/**
 * Extract a price from a node, handling Blocket's nested price objects, e.g.
 *   { price: { amount: 249000, suffix: "kr" } }  or  { price: 249000 }.
 *
 * If the price lives in a nested object, that object is recorded in
 * `consumed` so the recursive walker won't also count it as a separate listing.
 */
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

/**
 * Recursively walk the response and collect any object that looks like a car
 * listing (has a usable price). Robust to Blocket reshaping `data`/`items`/`ads`.
 */
export function extractComps(payload: unknown): BlocketComp[] {
  const comps: BlocketComp[] = [];
  const seen = new Set<unknown>();
  // Nested price objects (e.g. {amount, suffix}) consumed by a parent listing,
  // so the walker never counts them as standalone listings.
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
    // Heuristic: a listing has a plausible car price (avoid picking up tiny
    // fee/option amounts buried elsewhere in the payload).
    if (price != null && price >= 5000 && price <= 5_000_000) {
      const yearVal = toNumber(pickFirst(obj, YEAR_KEYS));
      const mileageVal = toNumber(pickFirst(obj, MILEAGE_KEYS));
      const title =
        (typeof obj.subject === "string" && obj.subject) ||
        (typeof obj.title === "string" && obj.title) ||
        (typeof obj.heading === "string" && obj.heading) ||
        undefined;
      const url =
        (typeof obj.share_url === "string" && obj.share_url) ||
        (typeof obj.url === "string" && obj.url) ||
        null;
      const id =
        (typeof obj.ad_id === "string" && obj.ad_id) ||
        (typeof obj.id === "string" && obj.id) ||
        undefined;
      comps.push({
        id,
        title: title || undefined,
        price,
        year: yearVal,
        mileage_mil: mileageVal,
        url,
      });
    }

    // Keep walking children regardless, to find nested listing arrays.
    for (const val of Object.values(obj)) {
      if (val && typeof val === "object") visit(val);
    }
  };

  visit(payload);
  // De-duplicate by id (fall back to price+title) to avoid double counting.
  const byKey = new Map<string, BlocketComp>();
  for (const c of comps) {
    const key = c.id ?? `${c.price}|${c.title ?? ""}`;
    if (!byKey.has(key)) byKey.set(key, c);
  }
  return [...byKey.values()];
}

// --- Statistics ------------------------------------------------------------

/** Linear-interpolation percentile (0..1) over a numeric array. */
export function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return NaN;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  const frac = idx - lo;
  return sortedAsc[lo] * (1 - frac) + sortedAsc[hi] * frac;
}

function round100(n: number): number {
  return Math.round(n / 100) * 100;
}

// --- Public entry point ----------------------------------------------------

/**
 * Run a Blocket comparable-listings valuation for a vehicle.
 * Network errors never throw: they return `ok: false` with a `note`.
 */
export async function valuateWithBlocket(
  vehicle: ValuationVehicle,
  opts: ProviderOptions = {},
): Promise<ValuationResult> {
  const askingDiscount = opts.askingDiscount ?? 0.05;
  const params = buildSearchParams(vehicle, opts);

  const empty = (note: string): ValuationResult => ({
    ok: false,
    sampleSize: 0,
    marketLow: null,
    marketHigh: null,
    marketMedian: null,
    soldLow: null,
    soldHigh: null,
    confidence: 0,
    query: params,
    note,
    comps: [],
  });

  if (!params.q) {
    return empty("Saknar märke/modell – kan inte söka jämförbara annonser.");
  }

  let payload: unknown;
  try {
    const fetcher = opts.fetcher
      ? () => opts.fetcher!(params)
      : () => liveFetcher(params, opts.userAgent ?? DEFAULT_UA);
    payload = await fetcher();
  } catch (err) {
    return empty(
      `Blocket-anrop misslyckades: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const comps = extractComps(payload);
  if (comps.length === 0) {
    return empty("Inga jämförbara annonser hittades.");
  }

  const prices = comps
    .map((c) => c.price)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);

  const marketLow = round100(percentile(prices, 0.25));
  const marketHigh = round100(percentile(prices, 0.75));
  const marketMedian = round100(percentile(prices, 0.5));

  const soldLow = round100(marketLow * (1 - askingDiscount));
  const soldHigh = round100(marketHigh * (1 - askingDiscount));

  // Confidence proxy: more comps + tighter spread => higher confidence.
  const sizeScore = Math.min(1, prices.length / 20); // 20+ comps saturates
  const spread = marketHigh > 0 ? (marketHigh - marketLow) / marketHigh : 1;
  const spreadScore = Math.max(0, 1 - spread); // tighter band => closer to 1
  const confidence = Number((0.6 * sizeScore + 0.4 * spreadScore).toFixed(2));

  return {
    ok: true,
    sampleSize: prices.length,
    marketLow,
    marketHigh,
    marketMedian,
    soldLow,
    soldHigh,
    confidence,
    query: params,
    comps,
  };
}
