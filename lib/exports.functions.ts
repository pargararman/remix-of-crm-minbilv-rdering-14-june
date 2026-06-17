import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as XLSX from "xlsx";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const exportSchema = z.object({
  entity: z.enum(["leads", "billing", "audit", "dealers", "won_deals"]),
  fromDate: z.string().optional().nullable(),
  toDate: z.string().optional().nullable(),
});

export const generateExcelExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => exportSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let rows: Record<string, unknown>[] = [];
    let sheetName = "Export";

    if (data.entity === "leads") {
      sheetName = "Leads";
      let q = supabase
        .from("leads")
        .select("id, created_at, customer_name, phone, email, city, registration_number, stage, lead_score, owner_id, source")
        .order("created_at", { ascending: false })
        .limit(10000);
      if (data.fromDate) q = q.gte("created_at", data.fromDate);
      if (data.toDate) q = q.lte("created_at", data.toDate);
      const { data: leads, error } = await q;
      if (error) throw new Error(error.message);
      rows = (leads ?? []).map((l) => ({
        ID: l.id, Skapad: l.created_at, Namn: l.customer_name, Telefon: l.phone,
        Epost: l.email, Ort: l.city, Regnr: l.registration_number,
        Steg: l.stage, Score: l.lead_score, Säljare: l.owner_id, Källa: l.source,
      }));
    } else if (data.entity === "billing") {
      sheetName = "Fakturering";
      let q = supabase
        .from("billing_logs")
        .select("id, created_at, dealer_id, billing_type, amount, event_type, description, invoice_period_month, invoice_status, lead_id")
        .order("created_at", { ascending: false })
        .limit(10000);
      if (data.fromDate) q = q.gte("created_at", data.fromDate);
      if (data.toDate) q = q.lte("created_at", data.toDate);
      const { data: bs, error } = await q;
      if (error) throw new Error(error.message);
      rows = (bs ?? []).map((b) => ({
        ID: b.id, Skapad: b.created_at, Handlare: b.dealer_id, Typ: b.billing_type,
        Belopp: b.amount, Händelse: b.event_type, Beskrivning: b.description,
        Period: b.invoice_period_month, Status: b.invoice_status, Lead: b.lead_id,
      }));
    } else if (data.entity === "audit") {
      sheetName = "Audit";
      let q = supabase
        .from("audit_logs")
        .select("id, created_at, user_id, action, object_type, object_id, old_value, new_value")
        .order("created_at", { ascending: false })
        .limit(10000);
      if (data.fromDate) q = q.gte("created_at", data.fromDate);
      if (data.toDate) q = q.lte("created_at", data.toDate);
      const { data: a, error } = await q;
      if (error) throw new Error(error.message);
      rows = (a ?? []).map((r) => ({
        ID: r.id, Tid: r.created_at, Användare: r.user_id, Åtgärd: r.action,
        Objekttyp: r.object_type, ObjektID: r.object_id,
        Före: JSON.stringify(r.old_value ?? null), Efter: JSON.stringify(r.new_value ?? null),
      }));
    } else if (data.entity === "dealers") {
      sheetName = "Handlare";
      const { data: d, error } = await supabase
        .from("dealers")
        .select("id, company_name, email, phone, city, status, pricing_model, monthly_fee, price_per_lead, price_per_won_deal");
      if (error) throw new Error(error.message);
      rows = (d ?? []).map((r) => ({
        ID: r.id, Namn: r.company_name, Epost: r.email, Telefon: r.phone, Ort: r.city,
        Status: r.status, Modell: r.pricing_model, Månadsavgift: r.monthly_fee,
        PerLead: r.price_per_lead, PerVunnen: r.price_per_won_deal,
      }));
    } else if (data.entity === "won_deals") {
      sheetName = "Vunna affärer";
      let q = supabase
        .from("won_deals")
        .select("id, won_at, lead_id, dealer_id, final_price, created_by")
        .order("won_at", { ascending: false })
        .limit(10000);
      if (data.fromDate) q = q.gte("won_at", data.fromDate);
      if (data.toDate) q = q.lte("won_at", data.toDate);
      const { data: w, error } = await q;
      if (error) throw new Error(error.message);
      rows = (w ?? []).map((r) => ({
        ID: r.id, Vunnen: r.won_at, Lead: r.lead_id, Handlare: r.dealer_id,
        Slutpris: r.final_price, SkapadAv: r.created_by,
      }));
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const buf = XLSX.write(wb, { type: "base64", bookType: "xlsx" }) as string;

    await supabase.from("audit_logs").insert({
      user_id: userId, action: "export_excel", object_type: data.entity,
      new_value: { rows: rows.length, from: data.fromDate, to: data.toDate },
    });

    return {
      filename: `${data.entity}-${new Date().toISOString().slice(0, 10)}.xlsx`,
      base64: buf,
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      rows: rows.length,
    };
  });
