// Schemaläggning + avbrott av auto-followup-SMS.
// Skapar köade messages-rader med template_code så cron kan plocka upp dem.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveTemplate } from "@/lib/sms/templates.server";

interface FollowupConfig {
  enabled: boolean;
  steps: { code: string; hours: number; enabled: boolean }[];
}

export async function getFollowupConfig(): Promise<FollowupConfig> {
  const { data } = await supabaseAdmin
    .from("company_settings")
    .select(
      "followups_enabled, followup_1_enabled, followup_2_enabled, followup_3_enabled, followup_1_hours, followup_2_hours, followup_3_hours",
    )
    .limit(1)
    .maybeSingle();
  const d: any = data ?? {};
  return {
    enabled: d.followups_enabled !== false,
    steps: [
      { code: "followup_1", hours: d.followup_1_hours ?? 24, enabled: d.followup_1_enabled !== false },
      { code: "followup_2", hours: d.followup_2_hours ?? 72, enabled: d.followup_2_enabled !== false },
      { code: "followup_3", hours: d.followup_3_hours ?? 168, enabled: d.followup_3_enabled !== false },
    ],
  };
}

export async function scheduleFollowups(leadId: string): Promise<{ scheduled: number }> {
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!from) return { scheduled: 0 };

  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("id, phone, customer_name, registration_number")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead?.phone) return { scheduled: 0 };

  const [{ data: vehicle }, { data: pricing }] = await Promise.all([
    supabaseAdmin.from("vehicles").select("brand, model").eq("lead_id", leadId).maybeSingle(),
    supabaseAdmin
      .from("pricing")
      .select("valuation_from, valuation_to")
      .eq("lead_id", leadId)
      .maybeSingle(),
  ]);

  const cfg = await getFollowupConfig();
  if (!cfg.enabled) return { scheduled: 0 };
  const plan = cfg.steps.filter((s) => s.enabled);

  let scheduled = 0;
  for (const p of plan) {
    const { data: tpl } = await supabaseAdmin
      .from("sms_templates")
      .select("body_sv")
      .eq("code", p.code)
      .eq("is_active", true)
      .maybeSingle();
    if (!tpl) continue;
    const body = resolveTemplate(tpl.body_sv, { lead, vehicle, pricing });
    const sendAt = new Date(Date.now() + p.hours * 3600 * 1000);
    const { error } = await supabaseAdmin.from("messages").insert({
      lead_id: leadId,
      direction: "outbound",
      from_phone: from,
      to_phone: lead.phone,
      body,
      delivery_status: "queued",
      send_at: sendAt.toISOString(),
      template_code: p.code,
    });
    if (!error) scheduled++;
  }
  if (scheduled > 0) {
    await supabaseAdmin.from("activity_timeline").insert({
      lead_id: leadId,
      type: "followups_scheduled",
      description: `${scheduled} uppföljnings-SMS schemalagda`,
      actor_type: "system",
      metadata: { count: scheduled },
    });
  }
  return { scheduled };
}

export async function cancelScheduledFollowups(leadId: string, reason: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("messages")
    .update({ delivery_status: "cancelled", delivery_error: `cancelled: ${reason}` })
    .eq("lead_id", leadId)
    .eq("delivery_status", "queued")
    .like("template_code", "followup_%")
    .select("id");
  if (error) return 0;
  const n = data?.length ?? 0;
  if (n > 0) {
    await supabaseAdmin.from("activity_timeline").insert({
      lead_id: leadId,
      type: "followups_cancelled",
      description: `${n} köade uppföljnings-SMS avbrutna (${reason})`,
      actor_type: "system",
      metadata: { count: n, reason },
    });
  }
  return n;
}
