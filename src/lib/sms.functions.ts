// Server functions: SMS från UI (Fas 2.2 använder dessa).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendSms } from "@/lib/sms/send.server";
import { isInQuietHours } from "@/lib/sms/quiet-hours.server";

// Lista konversationer för SMS-inbox. Senaste meddelande per lead.
export const listConversations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ onlyUnread: z.boolean().optional(), limit: z.number().int().min(1).max(200).optional() })
      .optional()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const limit = data?.limit ?? 50;

    // Hämta alla meddelanden (RLS säkerställer att säljaren bara ser sina leads).
    const { data: msgs, error: me } = await supabase
      .from("messages")
      .select("id, lead_id, direction, body, created_at, read_at, delivery_status")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (me) throw new Error(me.message);

    // Senaste meddelande per lead + räkna olästa inbound.
    const lastByLead = new Map<string, any>();
    const unreadByLead = new Map<string, number>();
    for (const m of (msgs ?? []) as any[]) {
      if (!lastByLead.has(m.lead_id)) lastByLead.set(m.lead_id, m);
      if (m.direction === "inbound" && !m.read_at) {
        unreadByLead.set(m.lead_id, (unreadByLead.get(m.lead_id) ?? 0) + 1);
      }
    }

    const leadIds = Array.from(lastByLead.keys());
    if (leadIds.length === 0) return { conversations: [] };

    const { data: leads } = await supabase
      .from("leads")
      .select(
        `id, customer_name, phone, stage, owner_id, pin_inbox_at,
         vehicle:vehicles(brand, model, year),
         registration_number`,
      )
      .in("id", leadIds);

    const leadById = new Map<string, any>();
    for (const l of (leads ?? []) as any[]) {
      leadById.set(l.id, {
        ...l,
        vehicle: Array.isArray(l.vehicle) ? l.vehicle[0] ?? null : l.vehicle ?? null,
      });
    }

    let convs = leadIds
      .map((id) => {
        const last = lastByLead.get(id);
        const lead = leadById.get(id);
        if (!lead) return null;
        return {
          leadId: id,
          customerName: lead.customer_name as string | null,
          phone: lead.phone as string,
          regnr: lead.registration_number as string,
          stage: lead.stage as string,
          vehicle: lead.vehicle as { brand: string | null; model: string | null; year: number | null } | null,
          pinnedAt: lead.pin_inbox_at as string | null,
          lastBody: last.body as string,
          lastDirection: last.direction as string,
          lastAt: last.created_at as string,
          unread: unreadByLead.get(id) ?? 0,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (data?.onlyUnread) convs = convs.filter((c) => c.unread > 0);

    // Pinnade överst → olästa → senaste tid.
    convs.sort((a, b) => {
      if (!!a.pinnedAt !== !!b.pinnedAt) return a.pinnedAt ? -1 : 1;
      if ((a.unread > 0) !== (b.unread > 0)) return a.unread > 0 ? -1 : 1;
      return new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime();
    });

    return { conversations: convs.slice(0, limit) };
  });

// Markera senaste inbound som oläst igen (för "markera oläst"-knapp).
export const markConversationUnread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ leadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("messages")
      .select("id")
      .eq("lead_id", data.leadId)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!row) return { ok: true };
    const { error } = await context.supabase
      .from("messages")
      .update({ read_at: null })
      .eq("id", (row as any).id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Pinna/avpinna konversation.
export const togglePinConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ leadId: z.string().uuid(), pinned: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("leads")
      .update({ pin_inbox_at: data.pinned ? new Date().toISOString() : null })
      .eq("id", data.leadId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });



export const sendSmsToLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        leadId: z.string().uuid(),
        message: z.string().min(1).max(1600).optional(),
        templateCode: z.string().min(1).max(50).optional(),
      })
      .refine((v) => v.message || v.templateCode, { message: "message eller templateCode krävs" })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const quiet = await isInQuietHours();
    const r = await sendSms({
      leadId: data.leadId,
      message: data.message,
      templateCode: data.templateCode,
      senderId: context.userId,
      isSystem: false,
      bypassQuietHours: true,
    });
    return { ...r, quietHoursWarning: quiet };
  });

export const listMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ leadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("messages")
      .select("id, direction, sender_id, body, delivery_status, delivery_error, send_at, read_at, created_at, twilio_message_sid, template_code, is_system")
      .eq("lead_id", data.leadId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return { messages: rows ?? [] };
  });

export const markMessagesRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ leadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("lead_id", data.leadId)
      .is("read_at", null)
      .eq("direction", "inbound");
    if (error) throw error;
    return { ok: true };
  });

export const listSmsTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("sms_templates")
      .select("id, code, label_sv, body_sv, is_active")
      .eq("is_active", true)
      .order("label_sv");
    if (error) throw error;
    return { templates: data ?? [] };
  });
