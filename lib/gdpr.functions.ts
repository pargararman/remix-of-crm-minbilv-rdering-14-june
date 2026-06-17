import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const createSchema = z.object({
  request_type: z.enum(["access", "deletion", "rectification"]),
  customer_phone: z.string().max(40).optional().nullable(),
  customer_email: z.string().email().max(255).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const createGdprRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (!data.customer_phone && !data.customer_email) {
      throw new Error("Ange telefon eller e-post");
    }
    // Match leads
    let q = supabase.from("leads").select("id");
    const ors: string[] = [];
    if (data.customer_phone) ors.push(`phone.eq.${data.customer_phone}`);
    if (data.customer_email) ors.push(`email.eq.${data.customer_email}`);
    if (ors.length) q = q.or(ors.join(","));
    const { data: leads } = await q;
    const matched = (leads ?? []).map((l) => l.id);
    const { data: row, error } = await supabase
      .from("gdpr_requests")
      .insert({
        request_type: data.request_type,
        customer_phone: data.customer_phone ?? null,
        customer_email: data.customer_email ?? null,
        matched_lead_ids: matched,
        notes: data.notes ?? null,
        status: "pending",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listGdprRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("gdpr_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const processSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["mark_processed", "anonymize", "reject"]),
  notes: z.string().max(2000).optional().nullable(),
});

export const processGdprRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => processSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: req, error: rErr } = await supabase
      .from("gdpr_requests")
      .select("*")
      .eq("id", data.id)
      .single();
    if (rErr) throw new Error(rErr.message);

    if (data.action === "anonymize" && req.matched_lead_ids?.length) {
      const stamp = `anonymiserad-${Date.now()}`;
      const { error: aErr } = await supabase
        .from("leads")
        .update({
          customer_name: stamp,
          phone: stamp,
          email: `${stamp}@anon.invalid`,
        })
        .in("id", req.matched_lead_ids);
      if (aErr) throw new Error(aErr.message);
      await supabase.from("audit_logs").insert({
        user_id: userId,
        action: "gdpr_anonymize",
        object_type: "gdpr_request",
        object_id: data.id,
        new_value: { leads: req.matched_lead_ids.length },
      });
    }

    const newStatus = data.action === "reject" ? "rejected" : "processed";
    const { error: uErr } = await supabase
      .from("gdpr_requests")
      .update({
        status: newStatus,
        processed_at: new Date().toISOString(),
        processed_by: userId,
        notes: data.notes ?? req.notes ?? null,
      })
      .eq("id", data.id);
    if (uErr) throw new Error(uErr.message);
    return { ok: true };
  });
