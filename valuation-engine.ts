// valuation-engine.ts
// ---------------------------------------------------------------------------
// Turns a Blocket "market retail" signal into the numbers your business runs on:
//   - what the car is worth to a dealer (book-in / inpris)
//   - what you tell the customer in the auto-SMS (a conservative range)
//   - what the dealer is expected to resell at (utpris)
//
// Single source of truth for the ratio/margin logic. Keep it server-side and
// unit-test it. No network here — feed it the Blocket result.
// ---------------------------------------------------------------------------

export interface MarginBand {
  /** Inclusive lower bound of the RETAIL value this band applies to (SEK). */
  minRetail: number;
  /** Flat margin in SEK, OR percentage of retail — exactly one of these. */
  flatSek?: number;
  pctLow?: number; // e.g. 0.08 = 8 %
  pctHigh?: number; // e.g. 0.10 = 10 %
}

// Dealer-expected GROSS margin (spread between book-in and resale), from the
// table you supplied. Ordered low -> high. The 400k boundary is made monotonic:
// we floor the % bands at the previous flat (40k) so a more expensive car never
// gets a *smaller* margin than a cheaper one.
export const MARGIN_TABLE: MarginBand[] = [
  { minRetail: 0, flatSek: 30_000 }, // < 200k  -> 30k flat
  { minRetail: 200_000, flatSek: 40_000 }, // 200–400k -> 40k flat
  { minRetail: 400_000, pctLow: 0.08, pctHigh: 0.10 }, // 400–700k -> 8–10 %
  { minRetail: 700_000, pctLow: 0.10, pctHigh: 0.12 }, // 700k+    -> 10–12 %
];

// Reconditioning / prep cost the dealer carries before resale. Tune from real
// data; this is the single biggest reason a naive "retail − margin" offer is
// too high. Conservative defaults below.
export interface EngineConfig {
  /** Blocket asking -> realised retail. Asking prices sit ~5–8 % above sold. */
  askingToSold: number; // default 0.95
  /** Fixed recon/prep estimate (SEK) added to the dealer's cost. */
  reconSek: number; // default 8_000
  /** Extra safety buffer on the LOW end of the customer range (fraction). */
  riskBuffer: number; // default 0.03
  /** Round all customer-facing numbers to this step (SEK). */
  round: number; // default 1_000
}

export const DEFAULT_CONFIG: EngineConfig = {
  askingToSold: 0.95,
  reconSek: 8_000,
  riskBuffer: 0.03,
  round: 1_000,
};

function roundTo(n: number, step: number): number {
  return Math.round(n / step) * step;
}

function bandFor(retail: number): MarginBand {
  let chosen = MARGIN_TABLE[0];
  for (const b of MARGIN_TABLE) if (retail >= b.minRetail) chosen = b;
  return chosen;
}

/** Dealer gross-margin range (SEK) for a given realised retail value. */
export function dealerMargin(retail: number): { low: number; high: number } {
  const b = bandFor(retail);
  if (b.flatSek != null) return { low: b.flatSek, high: b.flatSek };
  const low = retail * (b.pctLow ?? 0);
  const high = retail * (b.pctHigh ?? 0);
  // Monotonic floor: never below the 40k flat band.
  return { low: Math.max(low, 40_000), high: Math.max(high, 40_000) };
}

export interface ValuationInputs {
  /** Blocket market median = dealer ASKING / retail signal (SEK). */
  marketRetail: number;
  /** P25–P75 asking band from Blocket, for context (optional). */
  retailLow?: number | null;
  retailHigh?: number | null;
  config?: Partial<EngineConfig>;
}

export interface ValuationOutputs {
  /** Realised retail (what it actually sells for). */
  retailSold: number;
  /** Dealer resale target you publish to dealers (utpris). */
  dealerOutPrice: number;
  /** Dealer book-in / what you'd pay the customer (inpris), midpoint. */
  bookInMid: number;
  /** Conservative customer SMS range. Deliberately UNDER bookInMid so the
   *  human evaluation can only revise UP — never disappoint the seller. */
  customerLow: number;
  customerHigh: number;
  /** Margin band used (SEK), for audit. */
  marginLow: number;
  marginHigh: number;
}

/**
 * Core book-evaluation. Flow:
 *   Blocket asking  ──×askingToSold──>  retailSold
 *   retailSold − marginHigh − recon − risk  =  customerLow
 *   retailSold − marginLow  − recon         =  customerHigh
 *   bookInMid = midpoint of the two
 *   dealerOutPrice = retailSold (what the dealer relists at)
 */
export function evaluate(inputs: ValuationInputs): ValuationOutputs {
  const cfg = { ...DEFAULT_CONFIG, ...(inputs.config ?? {}) };
  const retailSold = inputs.marketRetail * cfg.askingToSold;
  const m = dealerMargin(retailSold);

  const high = retailSold - m.low - cfg.reconSek;
  const low = retailSold - m.high - cfg.reconSek - retailSold * cfg.riskBuffer;
  const mid = (low + high) / 2;

  return {
    retailSold: roundTo(retailSold, cfg.round),
    dealerOutPrice: roundTo(retailSold, cfg.round),
    bookInMid: roundTo(mid, cfg.round),
    customerLow: roundTo(Math.max(low, 0), cfg.round),
    customerHigh: roundTo(Math.max(high, 0), cfg.round),
    marginLow: Math.round(m.low),
    marginHigh: Math.round(m.high),
  };
}

// --- Example -------------------------------------------------------------
// const out = evaluate({ marketRetail: 350_000 });
// retailSold ~332.5k, margin 40k flat, recon 8k:
//   customerHigh ~284.5k, customerLow ~274.5k, bookInMid ~279.5k, outPrice ~332.5k
