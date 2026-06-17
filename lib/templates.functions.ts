// Server functions: SMS-mallar (preview + admin-edit).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTemplate } from "@/lib/sms/templates.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const previewTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        templateCode: z.string().min(1).max(50),
        leadId: z.string().uuid().optional(),
        rawBody: z.string().max(1600).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let body = data.rawBody;
    if (!body) {
      const { data: tpl, error } = await context.supabase
        .from("sms_templates")
        .select("body_sv")
        .eq("code", data.templateCode)
        .maybeSingle();
      if (error) throw error;
      if (!tpl) return { body: "" };
      body = tpl.body_sv;
    }

    let lead: { customer_name: string | null; registration_number: string | null } = {
      customer_name: null,
      registration_number: null,
    };
    let vehicle: { brand: string | null; model: string | null } | null = null;
    let pricing: { valuation_from: number | null; valuation_to: number | null; pricing_notes?: string | null } | null = null;
    if (data.leadId) {
      const [{ data: l }, { data: v }, { data: p }] = await Promise.all([
        context.supabase
          .from("leads")
          .select("customer_name, registration_number")
          .eq("id", data.leadId)
          .maybeSingle(),
        context.supabase.from("vehicles").select("brand, model").eq("lead_id", data.leadId).maybeSingle(),
        context.supabase
          .from("pricing")
          .select("valuation_from, valuation_to, pricing_notes")
          .eq("lead_id", data.leadId)
          .maybeSingle(),
      ]);
      if (l) lead = l;
      vehicle = v;
      pricing = p;
    }
    return { body: resolveTemplate(body, { lead, vehicle, pricing }) };
  });

export const updateSmsTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        code: z.string().min(1).max(50),
        body_sv: z.string().min(1).max(1600),
        label_sv: z.string().min(1).max(100).optional(),
        is_active: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Admin-check via has_role
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("role")
      .eq("id", context.userId)
      .maybeSingle();
    if (profile?.role !== "admin") throw new Error("Endast admin");

    const patch: {
      body_sv: string;
      updated_by: string;
      label_sv?: string;
      is_active?: boolean;
    } = { body_sv: data.body_sv, updated_by: context.userId };
    if (data.label_sv !== undefined) patch.label_sv = data.label_sv;
    if (data.is_active !== undefined) patch.is_active = data.is_active;

    const { error } = await supabaseAdmin
      .from("sms_templates")
      .update(patch)
      .eq("code", data.code);
    if (error) throw error;
    return { ok: true };
  });

export const listAllTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("sms_templates")
      .select("id, code, label_sv, body_sv, is_active, updated_at")
      .order("code");
    if (error) throw error;
    return { templates: data ?? [] };
  });
