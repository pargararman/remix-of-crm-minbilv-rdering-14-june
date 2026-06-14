// blocket-provider.PATCH.ts
// ---------------------------------------------------------------------------
// Drop-in replacements for the broken parts of src/lib/valuation/blocket-provider.ts
// Reason: the current extractComps() falls back to a RECURSIVE scan that grabs
// every { price | amount | value } node anywhere in Blocket's JSON — related
// ads, promoted spots, price-stats blocks, store metadata. That inflates the
// "annonser" count and drags the median to a junk number. This pins parsing to
// the real listing array ONLY, and refuses to guess.
// ---------------------------------------------------------------------------

import type { BlocketComp } from "./types";

// STEP 0 — confirm the real shape ONCE. Add this at the top of liveFetcher,
// run one real valuation, read the log, then delete it. Do NOT ship logic
// against an assumed shape.
//
//   const json = await res.json();
//   console.log("[blocket] top keys:", Object.keys(json));
//   console.log("[blocket] first item:", JSON.stringify(
//     (json.docs ?? json.data ?? json.ads ?? [])[0], null, 2));
//   return json;

// The listing array lives under exactly one of these keys. Add the real one
// first once confirmed. We NEVER walk the whole tree.
const LISTING_ARRAY_KEYS = ["docs", "data", "ads", "items", "results"] as const;

function pickListingArray(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== "object") return [];
  const obj = payload as Record<string, unknown>;
  for (const k of LISTING_ARRAY_KEYS) {
    const v = obj[k];
    if (Array.isArray(v)) return v as Record<string, unknown>[];
  }
  return [];
}

function num(x: unknown): number | null {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string") {
    const c = x.replace(/[^\d]/g, "");
    return c ? Number(c) : null;
  }
  return null;
}

// Handle BOTH known shapes explicitly: the documented `docs` shape AND the
// fixture `data` shape. Anything missing a sane price is dropped (not scraped).
function mapListing(d: Record<string, unknown>): BlocketComp | null {
  // price: number | { amount }
  const p = d.price;
  let price: number | null = null;
  if (typeof p === "number") price = p;
  else if (p && typeof p === "object") price = num((p as Record<string, unknown>).amount);
  else price = num(p);
  if (price == null || price < 10_000 || price > 5_000_000) return null;

  // seller type: docs uses dealer_segment ("Företag"/"Privat"); some shapes
  // use seller_type / ad_type. Unknown => null (and we DON'T silently keep it).
  const segRaw =
    (typeof d.dealer_segment === "string" && d.dealer_segment) ||
    (typeof d.seller_type === "string" && d.seller_type) ||
    (typeof d.ad_type === "string" && d.ad_type) ||
    "";
  const seg = segRaw.toLowerCase();
  const isDealer = /företag|foretag|store|dealer|handlare|näringsidkare/.test(seg)
    ? true
    : /privat|private/.test(seg)
      ? false
      : null;

  const title =
    (typeof d.subject === "string" && d.subject) ||
    [d.heading, d.model_specification].filter((s) => typeof s === "string").join(" ").trim() ||
    undefined;

  return {
    id: d.ad_id != null ? String(d.ad_id) : d.id != null ? String(d.id) : undefined,
    title: title || undefined,
    price,
    year: num(d.modelYear ?? d.model_year ?? d.year ?? d.regdate),
    mileage_mil: num(d.mileage ?? d.milage),
    url:
      (typeof d.canonical_url === "string" && d.canonical_url) ||
      (typeof d.share_url === "string" && d.share_url) ||
      null,
    sellerType: segRaw || null,
    isDealer,
  };
}

/** Pure, predictable replacement for the old extractComps(). */
export function extractComps(payload: unknown): BlocketComp[] {
  const arr = pickListingArray(payload);
  const out: BlocketComp[] = [];
  const seen = new Set<string>();
  for (const d of arr) {
    if (!d || typeof d !== "object") continue;
    const c = mapListing(d);
    if (!c) continue;
    const key = c.id ?? `${c.price}|${c.title ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

// ---------------------------------------------------------------------------
// ALSO recommended in valuateWithBlocket():
//
// 1) Drop free-text `q` once `make` filter works — "Volvo XC90" free-text pulls
//    in V60/XC60/etc. Prefer the structured make+model filter; keep `q` only as
//    a fallback when make id is unknown.
//
// 2) Hard-require a minimum dealer sample before returning ok:true. If
//    dealers.length < 5, return ok:false with a note rather than valuing off
//    private ads. Right now it silently falls back to "all" and the number the
//    customer sees is built from private sellers + noise.
//
// 3) Surface the seller mix in the result (dealerCount vs privateCount) so the
//    CRM can show "12 handlarannonser (av 31 totalt)" instead of a bare count
//    that mixes both.
// ---------------------------------------------------------------------------
