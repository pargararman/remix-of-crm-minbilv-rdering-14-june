// Resolverar tokens i SMS-mallar.
const sek = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 });

function firstName(full: string | null | undefined): string {
  if (!full) return "";
  return full.trim().split(/\s+/)[0] ?? "";
}

function fmtAmount(n: number | null | undefined): string {
  return n != null ? sek.format(n) : "___";
}

interface ResolveCtx {
  lead: { customer_name?: string | null; registration_number?: string | null };
  vehicle?: { brand?: string | null; model?: string | null } | null;
  pricing?: { valuation_from?: number | null; valuation_to?: number | null } | null;
}

export function resolveTemplate(body: string, ctx: ResolveCtx): string {
  return body
    .replaceAll("{KUNDNAMN}", firstName(ctx.lead.customer_name))
    .replaceAll("{REGNR}", ctx.lead.registration_number ?? "")
    .replaceAll("{VARDERING_FRAN}", fmtAmount(ctx.pricing?.valuation_from))
    .replaceAll("{VARDERING_TILL}", fmtAmount(ctx.pricing?.valuation_to))
    .replaceAll("{SUMMA}", "___");
}
