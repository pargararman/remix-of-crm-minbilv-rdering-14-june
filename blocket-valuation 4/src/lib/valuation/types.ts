// Shared types for the Blocket-based valuation provider.

/** Minimal vehicle shape the provider needs to build a comparable search. */
export interface ValuationVehicle {
  brand?: string | null;
  model?: string | null;
  version?: string | null;
  year?: number | null;
  /** Odometer in "mil" (Swedish mil = 10 km), matching the CRM `mileage_mil` column. */
  mileage_mil?: number | null;
  fuel?: string | null; // CRM fuel_type enum value (e.g. "plugin_bensin")
  gearbox?: string | null; // CRM gearbox_type enum value (e.g. "automatisk")
  drive_type?: string | null;
  body_type?: string | null;
}

/** A single comparable listing extracted from the Blocket response. */
export interface BlocketComp {
  id?: string;
  title?: string;
  price: number; // SEK asking price
  year?: number | null;
  mileage_mil?: number | null;
  url?: string | null;
}

/** Result of a valuation run. All prices in SEK. */
export interface ValuationResult {
  ok: boolean;
  /** Number of comparable listings that contributed to the range. */
  sampleSize: number;
  /** Market (asking) range = 25th-75th percentile of comp asking prices. */
  marketLow: number | null;
  marketHigh: number | null;
  /** Median asking price across comps. */
  marketMedian: number | null;
  /** Estimated realistic sold range after the asking->sold discount. */
  soldLow: number | null;
  soldHigh: number | null;
  /** 0..1 confidence proxy derived from sample size and price spread. */
  confidence: number;
  /** Echo of the search that produced this (for debugging / audit). */
  query: BlocketSearchParams;
  /** Human-readable note (errors, fallbacks, warnings). */
  note?: string;
  /** The comps used, for inspection. */
  comps: BlocketComp[];
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
  page: number;
  sort: string;
}

export interface ProviderOptions {
  /**
   * Inject a fetcher returning the raw Blocket JSON. Lets the eval harness and
   * unit tests run offline against fixtures. Defaults to a real HTTPS fetch.
   */
  fetcher?: (params: BlocketSearchParams) => Promise<unknown>;
  /** Year band half-width (default 1 => year +/- 1). */
  yearBand?: number;
  /** Mileage band half-width in mil (default 3000 mil = 30 000 km). */
  mileageBandMil?: number;
  /** Asking -> sold discount (default 0.05 = 5%). */
  askingDiscount?: number;
  userAgent?: string;
}
