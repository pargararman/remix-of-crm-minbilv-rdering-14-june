// Server fns: admin-inställningar (company_settings + audit).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function requireAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (data?.role !== "admin") throw new Error("Endast admin");
}

export const getCompanySettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("company_settings")
      .select("*")
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return { settings: data };
  });

export const updateTimingSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        followup_1_hours: z.number().int().min(1).max(720),
        followup_2_hours: z.number().int().min(1).max(720),
        followup_3_hours: z.number().int().min(1).max(720),
        inget_svar_hours: z.number().int().min(1).max(720),
        auto_archive_days: z.number().int().min(1).max(365),
        sms_quiet_hours_start: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
        sms_quiet_hours_end: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { id, ...patch } = data;
    const { data: old } = await supabaseAdmin
      .from("company_settings")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    const { error } = await supabaseAdmin.from("company_settings").update(patch).eq("id", id);
    if (error) throw error;
    await supabaseAdmin.from("audit_logs").insert({
      user_id: context.userId,
      action: "settings_timing_updated",
      object_type: "company_settings",
      object_id: id,
      old_value: old as any,
      new_value: patch as any,
    });
    return { ok: true };
  });

export const updateExternalLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        car_info_url_pattern: z.string().url().max(500)
          .refine((s) => s.includes("{REGNR}"), { message: "car.info-mönstret måste innehålla {REGNR}" }),
        biluppgifter_url_pattern: z.string().url().max(500)
          .refine((s) => s.includes("{REGNR}"), { message: "biluppgifter-mönstret måste innehålla {REGNR}" }),
        blocket_url_pattern: z.string().url().max(1000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { id, ...patch } = data;
    const { error } = await supabaseAdmin.from("company_settings").update(patch as any).eq("id", id);
    if (error) throw error;
    await supabaseAdmin.from("audit_logs").insert({
      user_id: context.userId,
      action: "settings_links_updated",
      object_type: "company_settings",
      object_id: id,
      new_value: patch as any,
    });
    return { ok: true };
  });

export const updateValuationSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        valuation_margin_amount: z.number().int().min(0).max(10_000_000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { id, ...patch } = data;
    const { data: old } = await supabaseAdmin
      .from("company_settings")
      .select("valuation_margin_amount")
      .eq("id", id)
      .maybeSingle();
    const { error } = await supabaseAdmin.from("company_settings").update(patch as any).eq("id", id);
    if (error) throw error;
    await supabaseAdmin.from("audit_logs").insert({
      user_id: context.userId,
      action: "settings_valuation_updated",
      object_type: "company_settings",
      object_id: id,
      old_value: old as any,
      new_value: patch as any,
    });
    return { ok: true };
  });

export const logAuditAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        action: z.string().min(1).max(100).regex(/^[a-z_]+$/),
        leadId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await supabaseAdmin.from("audit_logs").insert({
      user_id: context.userId,
      action: data.action,
      object_type: data.leadId ? "lead" : null,
      object_id: data.leadId ?? null,
    });
    return { ok: true };
  });
