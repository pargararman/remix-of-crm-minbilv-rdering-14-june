// Production valuation engine.
//
// Dealer-safe offer logic is intentionally NOT median-based:
//   1) filtered dealer comparables are sorted cheapest -> most expensive
//   2) Utpris is calculated from lower-market resale/listing prices
//   3) Inpris is calculated from Utpris minus dealer margin + operating buffers
//   4) customer-facing text only communicates the Inpris range

import type { BlocketComp } from "./types";
import type { ValuationConfidenceLevel } from "./types";

export interface DeductionBand {
  label: string;
  deduction: number;
  method: "flat" | "percent";
  percent?: number;
}

export interface OfferBufferConfig {
  marginAmount?: number | null;
  reconditioningBuffer?: number | null;
  riskBuffer?: number | null;
  adminTransportBuffer?: number | null;
  negotiationBuffer?: number | null;
}

export interface CustomerOfferBreakdown {
  referencePrice: number;
  referenceListing: BlocketComp;
  referenceRank: number;
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

const DEFAULT_RECONDITIONING_BUFFER = 4_000;
const DEFAULT_RISK_BUFFER = 2_000;
const DEFAULT_ADMIN_TRANSPORT_BUFFER = 1_000;
const DEFAULT_NEGOTIATION_BUFFER = 1_000;

function round100(n: number): number {
  return Math.round(n / 100) * 100;
}

function round1000(n: number): number {
  return Math.round(n / 1000) * 1000;
}

function clampMin0(n: number): number {
  return n < 0 ? 0 : n;
}

function positiveOrDefault(value: number | null | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? round100(value) : fallback;
}

function average(nums: number[]): number {
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

export function sekNumber(n: number): string {
  // sv-SE can emit non-breaking/narrow spaces; normalize for SMS safety.
  return n.toLocaleString("sv-SE", { maximumFractionDigits: 0 }).replace(/\s/g, " ");
}

export function sek(n: number): string {
  return `${sekNumber(n)} kr`;
}

/**
 * Dealer margin table from the business rule.
 * We floor percentage bands at 40k to avoid the 400k boundary becoming non-monotonic.
 */
export function deductionForReference(referencePrice: number, marginAmount?: number | null): DeductionBand {
  if (typeof marginAmount === "number" && Number.isFinite(marginAmount) && marginAmount >= 0) {
    const deduction = round100(marginAmount);
    return {
      label: `admininställd bruttomarginal: ${sek(deduction)}`,
      deduction,
      method: "flat",
    };
  }
  if (referencePrice < 200_000) {
    return { label: "under 200 000 kr: fast avdrag 30 000 kr", deduction: 30_000, method: "flat" };
  }
  if (referencePrice < 400_000) {
    return { label: "200 000–400 000 kr: fast avdrag 40 000 kr", deduction: 40_000, method: "flat" };
  }
  if (referencePrice < 700_000) {
    const deduction = Math.max(40_000, round100(referencePrice * 0.09));
    return { label: "400 000–700 000 kr: cirka 9% avdrag, minst 40 000 kr", deduction, method: "percent", percent: 0.09 };
  }
  const deduction = round100(referencePrice * 0.11);
  return { label: "över 700 000 kr: cirka 11% avdrag", deduction, method: "percent", percent: 0.11 };
}

function bufferBreakdown(utpris: number, opts: OfferBufferConfig) {
  const margin = deductionForReference(utpris, opts.marginAmount);
  const reconditioningBuffer = positiveOrDefault(opts.reconditioningBuffer, DEFAULT_RECONDITIONING_BUFFER);
  const riskBuffer = positiveOrDefault(opts.riskBuffer, DEFAULT_RISK_BUFFER);
  const adminTransportBuffer = positiveOrDefault(opts.adminTransportBuffer, DEFAULT_ADMIN_TRANSPORT_BUFFER);
  const negotiationBuffer = positiveOrDefault(opts.negotiationBuffer, DEFAULT_NEGOTIATION_BUFFER);
  const totalDeduction = margin.deduction + reconditioningBuffer + riskBuffer + adminTransportBuffer + negotiationBuffer;
  return {
    margin,
    reconditioningBuffer,
    riskBuffer,
    adminTransportBuffer,
    negotiationBuffer,
    totalDeduction,
  };
}

export function calculateLowerMarketUtpris(compsSortedAsc: BlocketComp[]): {
  utpris: number;
  selected: BlocketComp[];
  method: string;
} | null {
  if (compsSortedAsc.length < 3) return null;
  const sorted = [...compsSortedAsc].sort((a, b) => a.price - b.price);
  const count = sorted.length;
  let take: number;
  let method: string;

  if (count >= 8) {
    take = Math.max(3, Math.ceil(count * 0.25));
    method = `snitt av billigaste ${take} av ${count} giltiga handlarannonser`;
  } else if (count >= 5) {
    take = 3;
    method = "snitt av de 3 billigaste giltiga handlarannonserna";
  } else {
    take = Math.min(count, count === 3 ? 2 : 3);
    method = `konservativt snitt av billigaste ${take} av ${count} giltiga handlarannonser`;
  }

  const selected = sorted.slice(0, take);
  return {
    utpris: round1000(average(selected.map((c) => c.price))),
    selected,
    method,
  };
}

export function buildCustomerValuationText(args: {
  customerLow: number;
  customerHigh: number;
}): string {
  return (
    `Baserat på bilens uppgifter och aktuella jämförbara annonser uppskattar vi att vårt handlarnätverk ` +
    `kan erbjuda cirka ${sek(args.customerLow)}–${sek(args.customerHigh)} för din bil. ` +
    `Slutligt pris beror på skick, servicehistorik och genomgång av bilen.`
  );
}

export function calculateCustomerOffer(
  compsSortedAsc: BlocketComp[],
  opts: OfferBufferConfig & {
    allowSingleListing?: boolean;
    confidenceLevel?: ValuationConfidenceLevel;
    marketMedian?: number | null;
  } = {},
): CustomerOfferBreakdown | null {
  if (compsSortedAsc.length < 3 && !opts.allowSingleListing) return null;
  if (compsSortedAsc.length < 1) return null;

  const sorted = [...compsSortedAsc].sort((a, b) => a.price - b.price);
  const lowerMarket = calculateLowerMarketUtpris(sorted) ?? {
    utpris: round1000(sorted[0].price),
    selected: sorted.slice(0, 1),
    method: "billigaste giltiga annonsen (endast tillåtet för manuell fallback)",
  };
  const referencePrice = lowerMarket.utpris;
  const referenceListing = lowerMarket.selected[lowerMarket.selected.length - 1] ?? sorted[0];
  const referenceRank = lowerMarket.selected.length;
  const buffers = bufferBreakdown(referencePrice, opts);
  const customerOffer = round1000(clampMin0(referencePrice - buffers.totalDeduction));

  const customerLow = round1000(clampMin0(customerOffer - 2_000));
  const customerHigh = round1000(customerOffer + 3_000);
  const customerSmsText = buildCustomerValuationText({ customerLow, customerHigh });
  const confidenceLevel = opts.confidenceLevel ?? (sorted.length >= 5 ? "high" : sorted.length >= 3 ? "medium" : "low");
  const deductionBand =
    `${buffers.margin.label}; buffertar: rekond ${sek(buffers.reconditioningBuffer)}, ` +
    `risk ${sek(buffers.riskBuffer)}, admin/transport ${sek(buffers.adminTransportBuffer)}, ` +
    `förhandling ${sek(buffers.negotiationBuffer)}`;

  return {
    referencePrice,
    referenceListing,
    referenceRank,
    deduction: buffers.totalDeduction,
    deductionBand,
    customerOffer,
    customerLow,
    customerHigh,
    dealerOutPrice: referencePrice,
    dealerMarginTarget: buffers.margin.deduction,
    reconditioningBuffer: buffers.reconditioningBuffer,
    riskBuffer: buffers.riskBuffer,
    adminTransportBuffer: buffers.adminTransportBuffer,
    negotiationBuffer: buffers.negotiationBuffer,
    totalDeduction: buffers.totalDeduction,
    lowerMarketPrice: referencePrice,
    marketMedian: opts.marketMedian ?? null,
    confidenceLevel,
    customerSmsText,
    explanationText:
      `Utpris beräknas som ${lowerMarket.method}: ${sek(referencePrice)}. ` +
      `Inpris räknas därefter som Utpris minus total avdrag ${sek(buffers.totalDeduction)} ` +
      `(${deductionBand}). Beräknat Inpris ${sek(customerOffer)}. Kundintervall: ${sek(customerLow)}–${sek(customerHigh)}.`,
  };
}
