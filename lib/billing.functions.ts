// Fakturahantering: lista, markera, custom-entry, PDF-generering.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildInvoicePdf, uploadInvoicePdf } from "./invoice-pdf.server";

async function requireAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (data?.role !== "admin") throw new Error("Endast admin");
}

export const listBillingLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
        dealer_ids: z.array(z.string().uuid()).optional(),
        status: z
          .enum(["not_billed", "draft", "sent", "paid", "cancelled"])
          .optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId!);
    let q = supabaseAdmin
      .from("billing_logs")
      .select("*, dealer:dealers(id, company_name, pricing_model, org_number, city)")
      .order("created_at", { ascending: false });
    if (data.period) q = q.eq("invoice_period_month", data.period);
    if (data.dealer_ids && data.dealer_ids.length) q = q.in("dealer_id", data.dealer_ids);
    if (data.status) q = q.eq("invoice_status", data.status);
    const { data: rows, error } = await q;
    if (error) throw error;
    return { rows: rows ?? [] };
  });

export const markBillingInvoiced = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        ids: z.array(z.string().uuid()).min(1).max(500),
        status: z.enum(["sent", "paid", "cancelled", "draft", "not_billed"]),
        invoice_reference: z.string().max(100).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId!);
    const patch: any = {
      invoice_status: data.status,
      marked_invoiced_at: new Date().toISOString(),
      marked_invoiced_by: context.userId,
    };
    if (data.invoice_reference) patch.invoice_reference = data.invoice_reference;
    const { error } = await supabaseAdmin
      .from("billing_logs")
      .update(patch)
      .in("id", data.ids);
    if (error) throw error;
    await supabaseAdmin.from("audit_logs").insert({
      user_id: context.userId,
      action: "billing_status_changed",
      object_type: "billing_logs",
      new_value: { ids: data.ids, status: data.status } as never,
    } as never);
    return { ok: true, count: data.ids.length };
  });

export const updateBillingLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid(),
        amount: z.number().int().min(0).max(10_000_000).optional(),
        description: z.string().max(500).optional(),
        invoice_reference: z.string().max(100).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId!);
    const { id, ...patch } = data;
    const { error } = await supabaseAdmin.from("billing_logs").update(patch).eq("id", id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteBillingLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ id: z.string().uuid(), reason: z.string().min(3).max(500) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId!);
    const { data: old } = await supabaseAdmin
      .from("billing_logs")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await supabaseAdmin.from("billing_logs").delete().eq("id", data.id);
    if (error) throw error;
    await supabaseAdmin.from("audit_logs").insert({
      user_id: context.userId,
      action: "billing_deleted",
      object_type: "billing_logs",
      object_id: data.id,
      old_value: old as any,
      new_value: { reason: data.reason } as never,
    } as never);
    return { ok: true };
  });

export const addCustomBilling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        dealer_id: z.string().uuid(),
        lead_id: z.string().uuid().optional().nullable(),
        amount: z.number().int().min(0).max(10_000_000),
        description: z.string().min(1).max(500),
        period: z.string().regex(/^\d{4}-\d{2}$/),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId!);
    const { data: dealer } = await supabaseAdmin
      .from("dealers")
      .select("pricing_model")
      .eq("id", data.dealer_id)
      .single();
    const { error } = await supabaseAdmin.from("billing_logs").insert({
      dealer_id: data.dealer_id,
      lead_id: data.lead_id ?? null,
      billing_type: (dealer as any)?.pricing_model ?? "per_lead",
      amount: data.amount,
      event_type: "custom",
      description: data.description,
      invoice_period_month: data.period,
      invoice_status: "not_billed",
    } as never);
    if (error) throw error;
    return { ok: true };
  });

export const generateInvoicePdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        dealer_id: z.string().uuid(),
        period: z.string().regex(/^\d{4}-\d{2}$/),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId!);
    const { data: dealer } = await supabaseAdmin
      .from("dealers")
      .select("company_name, org_number, address, city")
      .eq("id", data.dealer_id)
      .single();
    if (!dealer) throw new Error("Handlare saknas");
    const { data: settings } = await supabaseAdmin
      .from("company_settings")
      .select("company_name, vat_rate, company_address, org_number, bank_details")
      .limit(1)
      .maybeSingle();
    const { data: rows } = await supabaseAdmin
      .from("billing_logs")
      .select("created_at, description, amount, event_type, invoice_reference")
      .eq("dealer_id", data.dealer_id)
      .eq("invoice_period_month", data.period)
      .order("created_at", { ascending: true });
    if (!rows || !rows.length) throw new Error("Inga rader för perioden");

    const bytes = await buildInvoicePdf({
      dealer: dealer as any,
      company: {
        name: (settings as any)?.company_name ?? "Min Bil Värdering.se",
        address: (settings as any)?.company_address,
        org_number: (settings as any)?.org_number,
        bank_details: (settings as any)?.bank_details,
        vat_rate: (settings as any)?.vat_rate ?? 25,
      },
      period: data.period,
      rows: (rows as any[]).map((r) => ({
        created_at: r.created_at,
        description: r.description,
        amount: r.amount,
        reference: r.invoice_reference,
        event_type: r.event_type,
      })),
    });
    const url = await uploadInvoicePdf(data.dealer_id, data.period, bytes);
    await supabaseAdmin.from("audit_logs").insert({
      user_id: context.userId,
      action: "invoice_pdf_generated",
      object_type: "dealer",
      object_id: data.dealer_id,
      new_value: { period: data.period, url } as never,
    } as never);
    return { url };
  });

export const billingSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ period: z.string().regex(/^\d{4}-\d{2}$/) }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId!);
    const { data: rows } = await supabaseAdmin
      .from("billing_logs")
      .select("amount, invoice_status, dealer_id")
      .eq("invoice_period_month", data.period);
    const all = (rows ?? []) as any[];
    const toInvoice = all
      .filter((r) => r.invoice_status === "not_billed")
      .reduce((s, r) => s + r.amount, 0);
    const invoiced = all
      .filter((r) => r.invoice_status === "sent" || r.invoice_status === "draft")
      .reduce((s, r) => s + r.amount, 0);
    const paid = all
      .filter((r) => r.invoice_status === "paid")
      .reduce((s, r) => s + r.amount, 0);
    const dealersWithUnbilled = new Set(
      all.filter((r) => r.invoice_status === "not_billed").map((r) => r.dealer_id),
    );
    return {
      total_to_invoice: toInvoice,
      total_invoiced: invoiced,
      total_paid: paid,
      dealer_count: dealersWithUnbilled.size,
    };
  });
