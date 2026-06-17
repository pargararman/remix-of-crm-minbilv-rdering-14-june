// Gemensam send-funktion för SMS — används av auto-flow, server-fn och cron.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isInQuietHours, nextSendWindow } from "./quiet-hours.server";
import { resolveTemplate } from "./templates.server";
import { sendViaTwilio } from "./twilio.server";
import { applyStageRule } from "@/lib/automation/stage-rules.server";

interface SendSmsInput {
  leadId: string;
  message?: string; // antingen rå message
  templateCode?: string; // eller mall som ska resolvas
  isSystem?: boolean; // true = auto-SMS, respekterar quiet-hours
  senderId?: string | null;
  bypassQuietHours?: boolean; // för manuella säljar-sends
}

export interface SendSmsResult {
  ok: boolean;
  messageId: string;
  status: "queued" | "sent" | "failed";
  queuedForQuietHours?: boolean;
  warning?: string;
  error?: string;
}

export async function sendSms(input: SendSmsInput): Promise<SendSmsResult> {
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!from) return { ok: false, messageId: "", status: "failed", error: "TWILIO_PHONE_NUMBER saknas" };

  // Hämta lead + vehicle + pricing
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("id, phone, customer_name, registration_number, owner_id")
    .eq("id", input.leadId)
    .maybeSingle();
  if (!lead) return { ok: false, messageId: "", status: "failed", error: "Lead saknas" };
  if (!lead.phone) return { ok: false, messageId: "", status: "failed", error: "Lead saknar telefon" };

  // Resolva body
  let body = input.message ?? "";
  if (input.templateCode) {
    const { data: tpl } = await supabaseAdmin
      .from("sms_templates")
      .select("body_sv")
      .eq("code", input.templateCode)
      .eq("is_active", true)
      .maybeSingle();
    if (!tpl) return { ok: false, messageId: "", status: "failed", error: `Mall saknas: ${input.templateCode}` };
    const { data: vehicle } = await supabaseAdmin
      .from("vehicles")
      .select("brand, model")
      .eq("lead_id", lead.id)
      .maybeSingle();
    const { data: pricing } = await supabaseAdmin
      .from("pricing")
      .select("valuation_from, valuation_to, pricing_notes")
      .eq("lead_id", lead.id)
      .maybeSingle();
    body = resolveTemplate(tpl.body_sv, { lead, vehicle, pricing });
  }
  if (!body.trim() || body.length > 1600) {
    return { ok: false, messageId: "", status: "failed", error: "Ogiltig meddelandelängd" };
  }

  // Quiet hours
  const isAuto = !!input.isSystem;
  const shouldQueue = isAuto && !input.bypassQuietHours && (await isInQuietHours());
  let sendAt: Date | null = null;
  if (shouldQueue) sendAt = await nextSendWindow();

  const testMode = process.env.SMS_TEST_MODE === "true";

  // Insert messages row
  const { data: msg, error: insErr } = await supabaseAdmin
    .from("messages")
    .insert({
      lead_id: lead.id,
      direction: "outbound",
      sender_id: input.senderId ?? null,
      from_phone: from,
      to_phone: lead.phone,
      body,
      delivery_status: "queued",
      send_at: sendAt?.toISOString() ?? null,
      template_code: input.templateCode ?? null,
      is_system: !!input.isSystem,
    })
    .select("id")
    .single();
  if (insErr || !msg) {
    return { ok: false, messageId: "", status: "failed", error: insErr?.message ?? "DB-fel" };
  }

  if (shouldQueue) {
    await supabaseAdmin.from("activity_timeline").insert({
      lead_id: lead.id,
      type: "sms_queued",
      description: `Auto-SMS köat för ${sendAt!.toISOString()} (tystnad-timme)`,
      actor_type: "system",
    });
    return { ok: true, messageId: msg.id, status: "queued", queuedForQuietHours: true };
  }

  const result = await dispatch(msg.id, lead.id, lead.phone, body, testMode, input.bypassQuietHours ? "quiet_hours" : undefined);
  // Auto-stage-movement vid lyckat outbound (best-effort, fel ska inte hindra svar).
  if (result.ok) {
    try {
      await applyStageRule(lead.id, { kind: "sms_outbound", templateCode: input.templateCode ?? null });
    } catch (e) {
      console.error("applyStageRule (sms_outbound) failed:", e);
    }
  }
  return result;
}

// Skickar (eller fejkar i testläge) ett redan-inskrivet message.
export async function dispatch(
  messageId: string,
  leadId: string,
  toPhone: string,
  body: string,
  testMode: boolean,
  warning?: string,
): Promise<SendSmsResult> {
  const from = process.env.TWILIO_PHONE_NUMBER!;

  if (testMode) {
    await supabaseAdmin
      .from("messages")
      .update({ delivery_status: "sent", twilio_message_sid: `TEST_${messageId}` })
      .eq("id", messageId);
    await afterSend(leadId, body);
    return { ok: true, messageId, status: "sent", warning };
  }

  // Kanonisk live-domän — Twilio följer inte redirects, så vi använder alltid
  // custom-domänen där webhooken faktiskt svarar direkt.
  const base = process.env.TWILIO_WEBHOOK_BASE_URL || "https://app.minbilvardering.se";
  const statusCallback = `${base.replace(/\/$/, "")}/api/public/twilio/status`;

  try {
    const result = await sendViaTwilio({ from, to: toPhone, body, statusCallback });
    await supabaseAdmin
      .from("messages")
      .update({ delivery_status: "sent", twilio_message_sid: result.sid })
      .eq("id", messageId);
    await afterSend(leadId, body);
    return { ok: true, messageId, status: "sent", warning };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    await supabaseAdmin
      .from("messages")
      .update({ delivery_status: "failed", delivery_error: err })
      .eq("id", messageId);
    return { ok: false, messageId, status: "failed", error: err };
  }
}

async function afterSend(leadId: string, body: string) {
  await supabaseAdmin
    .from("activity_timeline")
    .insert({
      lead_id: leadId,
      type: "sms_sent",
      description: `SMS skickat: ${body.slice(0, 80)}${body.length > 80 ? "…" : ""}`,
      actor_type: "system",
    });
  await supabaseAdmin.from("leads").update({ last_activity_at: new Date().toISOString() }).eq("id", leadId);
}
