// Shared types for the Blocket-based valuation provider.

/** Minimal vehicle shape the provider needs to build a comparable search. */
export interface ValuationVehicle {
  brand?: string | null;
  model?: string | null;
  version?: string | null;
  year?: number | null;
  /** Odometer in "mil" (Swedish mil = 10 km), matching the CRM `mileage_mil` column. */
  mileage_mil?: number | null;
  fuel?: string | null;
  gearbox?: string | null;
  drive_type?: string | null;
  body_type?: string | null;
  horsepower?: number | null;
}

/** A single comparable listing extracted from the Blocket response. */
export interface BlocketComp {
  id?: string;
  title?: string;
  price: number; // SEK asking price
  year?: number | null;
  mileage_mil?: number | null;
  fuel?: string | null;
  gearbox?: string | null;
  url?: string | null;
  /** Raw seller type string from Blocket, if present (e.g. "store", "private", "Företag"). */
  sellerType?: string | null;
  /** True = company/dealer ad, false = private, null = unknown. */
  isDealer?: boolean | null;
}

export type ValuationConfidenceLevel = "high" | "medium" | "low";
export type ValuationStatus = "ready_to_send" | "needs_review_with_price" | "needs_review_no_price";

export type ComparableQuality = "strong" | "acceptable" | "weak" | "rejected";

export interface ComparableScore {
  id?: string | null;
  title?: string | null;
  price: number;
  score: number;
  quality: ComparableQuality;
  reasons: string[];
  used: boolean;
}

export interface SearchAttemptSummary {
  stage: number;
  label: string;
  query: BlocketSearchParams;
  totalCount: number;
  comparableCount: number;
  dealerCount: number;
  privateCount: number;
  validCount: number;
  removedCount: number;
  sellerTypeAvailable: boolean;
  relaxedVersion: boolean;
  makeFilterRemoved?: boolean;
}

/** Cheapest / most-expensive reference listing for the overview. */
export interface CompRef {
  price: number;
  title?: string;
  url?: string | null;
}

export interface CustomerOfferResult {
  referencePrice: number;
  referenceRank: number;
  referenceListing: CompRef;
  deduction: number;
  deductionBand: string;
  customerOffer: number;
  customerLow: number;
  customerHigh: number;
  dealerOutPrice: number;
  dealerMarginTarget: number;
  reconditioningBuffer: number;
  riskBuffer: number;
  adminTransportBuffer: number;
  negotiationBuffer: number;
  totalDeduction: number;
  lowerMarketPrice: number;
  marketMedian: number | null;
  confidenceLevel: ValuationConfidenceLevel;
  customerSmsText: string;
  explanationText: string;
}

/** Result of a valuation run. All prices in SEK. */
export interface ValuationResult {
  ok: boolean;
  /** Count of raw listing objects parsed from Blocket's listing array. */
  totalCount: number;
  /** Count after local model/year/mileage comparability filtering. */
  comparableCount: number;
  /** Number of filtered comparable dealer/company listings. */
  dealerCount: number;
  /** Number of filtered comparable private listings. */
  privateCount: number;
  /** True if Blocket exposed seller/dealer/private data on at least one comparable listing. */
  sellerTypeAvailable: boolean;
  /** Count of listings actually used for valuation after seller filtering. */
  sampleSize: number;
  /** Legacy/context field: second-cheapest-minus-deduction exact customer offer. */
  offerMedian: number | null;
  /** Context only: median of used comparable listing prices. Not used for customer offer text. */
  marketMedian: number | null;
  /** Context range of used comparable listing prices. */
  marketLow: number | null;
  marketHigh: number | null;
  /** Lower-market resale/listing price basis before margin deduction. */
  lowerMarketPrice: number | null;
  /** Internal dealer resale/listing price saved as Utpris. */
  utpris: number | null;
  /** Number of parsed comparables removed by quality/outlier filters. */
  removedCount: number;
  /** Strong strict comparable count before any soft internal-only fallback. */
  strictComparableCount: number;
  /** Soft-scored fallback comparable count used only for internal/manual-review pricing. */
  softFallbackComparableCount: number;
  /** Fallback stage used for the valuation (1-4), if any search ran. */
  fallbackStage: number | null;
  /** All search attempts considered before the selected result. */
  searchAttempts: SearchAttemptSummary[];
  /** Cheapest and most expensive used listings, for the overview. */
  cheapest: CompRef | null;
  mostExpensive: CompRef | null;
  /** Second-cheapest reference and customer offer calculation. */
  customerOffer: CustomerOfferResult | null;
  /** 0..1 confidence proxy derived from sample size and price spread. */
  confidence: number;
  confidenceLevel: ValuationConfidenceLevel;
  valuationStatus: ValuationStatus;
  manualReviewReason: string | null;
  dealerAttractivenessScore: number;
  sanityChecks: {
    passed: boolean;
    blockers: string[];
    warnings: string[];
  };
  smsEligible: boolean;
  /** Echo of the search that produced this (for debugging / audit). */
  query: BlocketSearchParams;
  /** Human-readable note (errors, fallbacks, warnings). */
  note?: string;
  /** Used comps sorted cheapest first. */
  comps: BlocketComp[];
  /** Scored comparable audit rows, including rejected soft-fallback candidates where available. */
  comparableScores: ComparableScore[];
  /** Diagnostics for Blocket shape/403 debugging. */
  diagnostics?: {
    listingKey?: string | null;
    sellerField?: string | null;
    httpStatus?: number;
    url?: string;
    responseSnippet?: string;
  };
}

/** Normalised search parameters sent to Blocket. */
export interface BlocketSearchParams {
  q: string;
  make?: string | null;
  year_from?: number | null;
  year_to?: number | null;
  milage_from?: number | null; // Blocket spells it "milage", value in mil
  milage_to?: number | null;
  transmission?: number | null; // 1 = manual, 2 = automatic
  fuel?: number | null;
  page: number;
  sort: string;
}

export interface ProviderOptions {
  /** Inject a fetcher returning the raw Blocket JSON. Lets tests run offline against fixtures. */
  fetcher?: (params: BlocketSearchParams) => Promise<unknown>;
  /** Year band half-width (default 1 => year +/- 1). */
  yearBand?: number;
  /** Mileage band half-width in mil (default 3000 mil = 30 000 km). */
  mileageBandMil?: number;
  /** Minimum used comparable listings required for a numeric valuation (default 2). */
  minComparable?: number;
  /** Allow valuating from one listing. Caller should flag this for manual review. */
  allowSingleComparable?: boolean;
  /** Fixed dealer margin/admin deduction in SEK. Falls back to the legacy band table when omitted. */
  marginAmount?: number | null;
  reconditioningBuffer?: number | null;
  riskBuffer?: number | null;
  adminTransportBuffer?: number | null;
  negotiationBuffer?: number | null;
  userAgent?: string;
}
