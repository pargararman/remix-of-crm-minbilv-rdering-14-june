// Admin: SLA-mål & faktureringsinställningar.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function requireAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (data?.role !== "admin") throw new Error("Endast admin");
}

export const updateSlaTargets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid(),
        first_auto_sms_min: z.number().min(0).max(1440),
        first_manual_touch_min: z.number().min(0).max(1440),
        first_valuation_min: z.number().min(0).max(10000),
        first_bid_hours: z.number().min(0).max(720),
        customer_accepted_hours: z.number().min(0).max(720),
        pickup_hours: z.number().min(0).max(2400),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId!);
    const { id, ...targets } = data;
    const { data: old } = await supabaseAdmin
      .from("company_settings")
      .select("sla_targets")
      .eq("id", id)
      .maybeSingle();
    const { error } = await supabaseAdmin
      .from("company_settings")
      .update({ sla_targets: targets as never })
      .eq("id", id);
    if (error) throw error;
    await supabaseAdmin.from("audit_logs").insert({
      user_id: context.userId,
      action: "sla_targets_updated",
      object_type: "company_settings",
      object_id: id,
      old_value: old as any,
      new_value: targets as any,
    } as never);
    return { ok: true };
  });

export const updateBillingSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid(),
        vat_rate: z.number().int().min(0).max(100),
        company_address: z.string().max(500).nullable().optional(),
        org_number: z.string().max(50).nullable().optional(),
        bank_details: z.string().max(500).nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId!);
    const { id, ...patch } = data;
    const { error } = await supabaseAdmin
      .from("company_settings")
      .update(patch as never)
      .eq("id", id);
    if (error) throw error;
    return { ok: true };
  });

export const listDealersLight = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId!);
    const { data } = await supabaseAdmin
      .from("dealers")
      .select("id, company_name, pricing_model, status")
      .order("company_name");
    return { dealers: data ?? [] };
  });
