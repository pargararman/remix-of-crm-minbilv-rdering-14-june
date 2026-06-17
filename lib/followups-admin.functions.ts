// Admin: konfiguration av automatiska uppföljnings-SMS.
// Sekvens, timing, på/av per steg och mallinnehåll — allt på ett ställe.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/integrations/supabase/role-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const FOLLOWUP_CODES = ["followup_1", "followup_2", "followup_3"] as const;

export const getFollowupAdmin = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const [{ data: settings }, { data: templates }] = await Promise.all([
      supabaseAdmin
        .from("company_settings")
        .select(
          "id, followups_enabled, followup_1_enabled, followup_2_enabled, followup_3_enabled, followup_1_hours, followup_2_hours, followup_3_hours, sms_quiet_hours_start, sms_quiet_hours_end",
        )
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("sms_templates")
        .select("id, code, name, body_sv, is_active")
        .in("code", [...FOLLOWUP_CODES]),
    ]);

    // Statistik: skickade/köade/avbrutna uppföljningar senaste 30 dagarna.
    const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
    const { data: msgs } = await supabaseAdmin
      .from("messages")
      .select("template_code, delivery_status")
      .like("template_code", "followup_%")
      .gte("created_at", since);
    const stats: Record<string, { sent: number; queued: number; cancelled: number; failed: number }> = {};
    for (const code of FOLLOWUP_CODES) stats[code] = { sent: 0, queued: 0, cancelled: 0, failed: 0 };
    for (const m of msgs ?? []) {
      const s = stats[(m as any).template_code];
      if (!s) continue;
      const st = (m as any).delivery_status;
      if (st === "sent" || st === "delivered") s.sent++;
      else if (st === "queued") s.queued++;
      else if (st === "cancelled") s.cancelled++;
      else s.failed++;
    }

    const tplByCode = new Map((templates ?? []).map((t: any) => [t.code, t]));
    return {
      settingsId: (settings as any)?.id ?? null,
      enabled: (settings as any)?.followups_enabled !== false,
      quietHours: {
        start: (settings as any)?.sms_quiet_hours_start ?? "21:00",
        end: (settings as any)?.sms_quiet_hours_end ?? "08:00",
      },
      steps: FOLLOWUP_CODES.map((code, i) => ({
        code,
        order: i + 1,
        enabled: (settings as any)?.[`followup_${i + 1}_enabled`] !== false,
        hours: (settings as any)?.[`followup_${i + 1}_hours`] ?? [24, 72, 168][i],
        template: tplByCode.get(code)
          ? {
              id: (tplByCode.get(code) as any).id,
              name: (tplByCode.get(code) as any).name,
              body: (tplByCode.get(code) as any).body_sv,
              isActive: (tplByCode.get(code) as any).is_active,
            }
          : null,
        stats: stats[code],
      })),
    };
  });

export const updateFollowupSettings = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((i) =>
    z
      .object({
        settingsId: z.string().uuid(),
        enabled: z.boolean(),
        steps: z
          .array(
            z.object({
              code: z.enum(FOLLOWUP_CODES),
              enabled: z.boolean(),
              hours: z.number().int().min(1).max(720),
            }),
          )
          .length(3),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = { followups_enabled: data.enabled };
    for (const s of data.steps) {
      const n = s.code.split("_")[1];
      patch[`followup_${n}_enabled`] = s.enabled;
      patch[`followup_${n}_hours`] = s.hours;
    }
    const { error } = await supabaseAdmin
      .from("company_settings")
      .update(patch as never)
      .eq("id", data.settingsId);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("audit_logs").insert({
      user_id: (context as any).userId,
      action: "settings_followups_updated",
      object_type: "company_settings",
      object_id: data.settingsId,
      new_value: patch as never,
    } as never);
    return { ok: true };
  });

export const updateFollowupTemplate = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((i) =>
    z
      .object({
        templateId: z.string().uuid(),
        body: z.string().min(1).max(1600),
        isActive: z.boolean(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin
      .from("sms_templates")
      .update({ body_sv: data.body, is_active: data.isActive } as never)
      .eq("id", data.templateId);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_logs").insert({
      user_id: (context as any).userId,
      action: "sms_template_updated",
      object_type: "sms_template",
      object_id: data.templateId,
      new_value: { body_sv: data.body, is_active: data.isActive } as never,
    } as never);
    return { ok: true };
  });
