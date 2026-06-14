// Server-only: skapar billing_logs vid publicering & vunnen affär.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function periodOf(d: Date = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function recordPerLeadBillingOnPublish(
  leadId: string,
  dealerIds: string[],
) {
  if (!dealerIds.length) return;
  const { data: dealers } = await supabaseAdmin
    .from("dealers")
    .select("id, pricing_model, price_per_lead, company_name")
    .in("id", dealerIds);
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("id, registration_number")
    .eq("id", leadId)
    .maybeSingle();
  const { data: vehicle } = await supabaseAdmin
    .from("vehicles")
    .select("brand, model, year")
    .eq("lead_id", leadId)
    .maybeSingle();

  // Idempotens: debitera aldrig samma (lead, handlare, typ) två gånger.
  // Skyddas även på DB-nivå av billing_logs_unique_lead_dealer_type.
  const { data: already } = await supabaseAdmin
    .from("billing_logs")
    .select("dealer_id")
    .eq("lead_id", leadId)
    .eq("billing_type", "per_lead")
    .in("dealer_id", dealerIds);
  const billed = new Set((already ?? []).map((r: any) => r.dealer_id));

  const rows: any[] = [];
  for (const d of dealers ?? []) {
    if ((d as any).pricing_model !== "per_lead") continue;
    if (billed.has((d as any).id)) continue;
    const amount = (d as any).price_per_lead ?? 0;
    rows.push({
      dealer_id: (d as any).id,
      lead_id: leadId,
      billing_type: "per_lead",
      amount,
      event_type: "lead_assigned",
      assigned_at: new Date().toISOString(),
      invoice_period_month: periodOf(),
      invoice_status: "not_billed",
      description: `${(lead as any)?.registration_number ?? ""} ${(vehicle as any)?.brand ?? ""} ${(vehicle as any)?.model ?? ""} ${(vehicle as any)?.year ?? ""} tilldelad`.trim(),
    });
  }
  if (rows.length) {
    await supabaseAdmin.from("billing_logs").insert(rows as never);
  }
}

export async function recordWonDealBilling(
  leadId: string,
  dealerId: string,
  finalPrice: number,
) {
  const { data: dealer } = await supabaseAdmin
    .from("dealers")
    .select("id, pricing_model, price_per_won_deal")
    .eq("id", dealerId)
    .maybeSingle();
  if (!dealer || (dealer as any).pricing_model !== "per_won_deal") return;
  // Idempotens — markLeadWon kan anropas mer än en gång (korrigeringar).
  const { data: already } = await supabaseAdmin
    .from("billing_logs")
    .select("id")
    .eq("lead_id", leadId)
    .eq("dealer_id", dealerId)
    .eq("billing_type", "per_won_deal")
    .limit(1)
    .maybeSingle();
  if (already) return;
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("registration_number")
    .eq("id", leadId)
    .maybeSingle();
  const { data: vehicle } = await supabaseAdmin
    .from("vehicles")
    .select("brand, model, year")
    .eq("lead_id", leadId)
    .maybeSingle();
  await supabaseAdmin.from("billing_logs").insert({
    dealer_id: dealerId,
    lead_id: leadId,
    billing_type: "per_won_deal",
    amount: (dealer as any).price_per_won_deal ?? 0,
    event_type: "lead_won",
    won_at: new Date().toISOString(),
    invoice_period_month: periodOf(),
    invoice_status: "not_billed",
    description: `${(lead as any)?.registration_number ?? ""} ${(vehicle as any)?.brand ?? ""} ${(vehicle as any)?.model ?? ""} ${(vehicle as any)?.year ?? ""} vunnen för ${finalPrice} kr`.trim(),
  } as never);
}
