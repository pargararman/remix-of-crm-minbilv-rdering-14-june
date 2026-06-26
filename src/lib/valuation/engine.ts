// Production valuation engine.
//
// Customer offer logic is intentionally NOT median-based:
//   1) filtered comparable listings are sorted cheapest -> most expensive
//   2) the second-cheapest comparable listing is the reference price
//   3) deduction X is computed from the agreed dealer margin table
//   4) customer offer = second-cheapest reference price - X
//   5) customer-facing text is generated from the exact same numbers

import type { BlocketComp } from "./types";

export interface DeductionBand {
  label: string;
  deduction: number;
  method: "flat" | "percent";
  percent?: number;
}

export interface CustomerOfferBreakdown {
  referencePrice: number;
  referenceListing: BlocketComp;
  referenceRank: 1 | 2;
  deduction: number;
  deductionBand: string;
  customerOffer: number;
  customerLow: number;
  customerHigh: number;
  dealerOutPrice: number;
  explanationText: string;
}

function round100(n: number): number {
  return Math.round(n / 100) * 100;
}

function clampMin0(n: number): number {
  return n < 0 ? 0 : n;
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
      label: `admininställd marginal: fast avdrag ${sek(deduction)}`,
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

export function buildCustomerValuationText(args: {
  referencePrice: number;
  referenceRank?: 1 | 2;
  deduction: number;
  customerOffer: number;
}): string {
  const referenceText =
    args.referenceRank === 1
      ? "det lägsta jämförbara priset"
      : "det näst lägsta jämförbara priset";
  return (
    `Baserat på jämförbara bilar som just nu ligger ute använder vi ${referenceText} ` +
    `(${sek(args.referencePrice)}) som referenspunkt och drar av ` +
    `${sek(args.deduction)} för marginal, klargöring, risk och återförsäljningskostnader. ` +
    `Det ger ett uppskattat kunderbjudande på ${sek(args.customerOffer)}.`
  );
}

export function calculateCustomerOffer(
  compsSortedAsc: BlocketComp[],
  opts: { marginAmount?: number | null; allowSingleListing?: boolean } = {},
): CustomerOfferBreakdown | null {
  if (compsSortedAsc.length < 2 && !opts.allowSingleListing) return null;
  if (compsSortedAsc.length < 1) return null;

  const sorted = [...compsSortedAsc].sort((a, b) => a.price - b.price);
  const referenceRank: 1 | 2 = sorted.length >= 2 ? 2 : 1;
  const referenceListing = sorted[referenceRank - 1];
  const referencePrice = round100(referenceListing.price);
  const band = deductionForReference(referencePrice, opts.marginAmount);
  const customerOffer = round100(clampMin0(referencePrice - band.deduction));

  // Pricing panel still has from/to fields. Keep them tight around the exact offer,
  // while the SMS text uses the exact offer and explanation.
  const customerLow = round100(clampMin0(customerOffer - 5_000));
  const customerHigh = round100(customerOffer);

  return {
    referencePrice,
    referenceListing,
    referenceRank,
    deduction: band.deduction,
    deductionBand: band.label,
    customerOffer,
    customerLow,
    customerHigh,
    dealerOutPrice: referencePrice,
    explanationText: buildCustomerValuationText({ referencePrice, referenceRank, deduction: band.deduction, customerOffer }),
  };
}
