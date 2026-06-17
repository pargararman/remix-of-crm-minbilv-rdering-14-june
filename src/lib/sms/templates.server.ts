// Resolverar tokens i SMS-mallar.
const sekFmt = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 });

function firstName(full: string | null | undefined): string {
  if (!full) return "";
  return full.trim().split(/\s+/)[0] ?? "";
}

function fmtAmount(n: number | null | undefined): string {
  return n != null ? sekFmt.format(n).replace(/\s/g, " ") : "___";
}

interface ResolveCtx {
  lead: { customer_name?: string | null; registration_number?: string | null };
  vehicle?: { brand?: string | null; model?: string | null } | null;
  pricing?: {
    valuation_from?: number | null;
    valuation_to?: number | null;
    pricing_notes?: string | null;
  } | null;
}

function fallbackValuationText(ctx: ResolveCtx): string {
  if (ctx.pricing?.pricing_notes?.trim()) return ctx.pricing.pricing_notes.trim();
  const from = fmtAmount(ctx.pricing?.valuation_from);
  const to = fmtAmount(ctx.pricing?.valuation_to);
  if (from !== "___" && to !== "___") return `Uppskattad kundvärdering: ${from}–${to} kr.`;
  return "Vi återkommer med en uppskattad kundvärdering efter genomgång av bilen.";
}

export function resolveTemplate(body: string, ctx: ResolveCtx): string {
  const valuationText = fallbackValuationText(ctx);
  return body
    .replaceAll("{KUNDNAMN}", firstName(ctx.lead.customer_name))
    .replaceAll("{REGNR}", ctx.lead.registration_number ?? "")
    .replaceAll("{VARDERING_FRAN}", fmtAmount(ctx.pricing?.valuation_from))
    .replaceAll("{VARDERING_TILL}", fmtAmount(ctx.pricing?.valuation_to))
    .replaceAll("{VARDERING_TEXT}", valuationText)
    .replaceAll("{SUMMA}", "___");
}
