// Server functions: orphan SMS-inbox.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizeRegnr } from "@/lib/format";

async function requireAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (data?.role !== "admin") throw new Error("Endast admin");
}

export const listOrphanMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ includeIgnored: z.boolean().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("inbound_orphan_messages")
      .select("id, twilio_message_sid, from_phone, body, received_at, assigned_to_lead_id, ignored")
      .order("received_at", { ascending: false })
      .limit(200);
    if (!data.includeIgnored) q = q.eq("ignored", false).is("assigned_to_lead_id", null);
    const { data: rows, error } = await q;
    if (error) throw error;
    return { orphans: rows ?? [] };
  });

export const assignOrphanToLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ orphanId: z.string().uuid(), leadId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: orphan } = await supabaseAdmin
      .from("inbound_orphan_messages")
      .select("id, twilio_message_sid, from_phone, body, assigned_to_lead_id")
      .eq("id", data.orphanId)
      .maybeSingle();
    if (!orphan) throw new Error("Orphan saknas");
    if (orphan.assigned_to_lead_id) throw new Error("Redan tilldelad");

    await supabaseAdmin.from("messages").insert({
      lead_id: data.leadId,
      direction: "inbound",
      from_phone: orphan.from_phone,
      to_phone: process.env.TWILIO_PHONE_NUMBER ?? null,
      body: orphan.body,
      twilio_message_sid: orphan.twilio_message_sid,
      delivery_status: "received",
    });
    await supabaseAdmin
      .from("inbound_orphan_messages")
      .update({
        assigned_to_lead_id: data.leadId,
        assigned_by: context.userId,
        assigned_at: new Date().toISOString(),
      })
      .eq("id", data.orphanId);
    await supabaseAdmin
      .from("leads")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", data.leadId);
    await supabaseAdmin.from("activity_timeline").insert({
      lead_id: data.leadId,
      type: "sms_received",
      description: "SMS från okänt nummer tilldelat manuellt",
      actor_id: context.userId,
      actor_type: "seller",
    });
    await supabaseAdmin.from("audit_logs").insert({
      user_id: context.userId,
      action: "orphan_sms_assigned",
      object_type: "lead",
      object_id: data.leadId,
      new_value: { orphan_id: data.orphanId },
    });
    return { ok: true };
  });

export const ignoreOrphan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ orphanId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("inbound_orphan_messages")
      .update({ ignored: true })
      .eq("id", data.orphanId);
    if (error) throw error;
    return { ok: true };
  });

export const createLeadFromOrphan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        orphanId: z.string().uuid(),
        regnr: z.string().min(2).max(10),
        email: z.string().email(),
        customerName: z.string().max(100).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: orphan } = await supabaseAdmin
      .from("inbound_orphan_messages")
      .select("id, twilio_message_sid, from_phone, body, assigned_to_lead_id")
      .eq("id", data.orphanId)
      .maybeSingle();
    if (!orphan) throw new Error("Orphan saknas");
    if (orphan.assigned_to_lead_id) throw new Error("Redan tilldelad");

    const regnr = normalizeRegnr(data.regnr);
    const { data: lead, error } = await supabaseAdmin
      .from("leads")
      .insert({
        customer_name: data.customerName ?? null,
        phone: orphan.from_phone,
        email: data.email,
        registration_number: regnr,
        source: "manual",
        stage: "ny_lead",
        owner_id: context.userId,
        owned_at: new Date().toISOString(),
        gdpr_consent: true,
        consent_timestamp: new Date().toISOString(),
        free_text: orphan.body,
      })
      .select("id")
      .single();
    if (error || !lead) throw error ?? new Error("Kunde inte skapa lead");

    await supabaseAdmin.from("vehicles").insert({ lead_id: lead.id });
    await supabaseAdmin.from("messages").insert({
      lead_id: lead.id,
      direction: "inbound",
      from_phone: orphan.from_phone,
      to_phone: process.env.TWILIO_PHONE_NUMBER ?? null,
      body: orphan.body,
      twilio_message_sid: orphan.twilio_message_sid,
      delivery_status: "received",
    });
    await supabaseAdmin
      .from("inbound_orphan_messages")
      .update({
        assigned_to_lead_id: lead.id,
        assigned_by: context.userId,
        assigned_at: new Date().toISOString(),
      })
      .eq("id", data.orphanId);
    await supabaseAdmin.from("activity_timeline").insert({
      lead_id: lead.id,
      type: "lead_created",
      description: "Lead skapad från okänt SMS",
      actor_id: context.userId,
      actor_type: "seller",
    });
    return { leadId: lead.id };
  });
