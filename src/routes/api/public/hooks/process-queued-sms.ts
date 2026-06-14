// Cron-route: skickar köade SMS som passerat send_at.
// Skyddad med x-cron-secret. Uppföljnings-SMS sanity-checkas mot leadets
// AKTUELLA stage — kunder vars affär gått vidare (publicerad/vunnen/
// förlorad/arkiverad) ska inte få "är du fortfarande intresserad?".
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { dispatch } from "@/lib/sms/send.server";
import { verifyCronAuth } from "@/lib/cron-auth.server";

// Stadier där kunduppföljning fortfarande är meningsfull.
const FOLLOWUP_OK_STAGES = new Set([
  "ny_lead",
  "snabb_vardering",
  "kontaktad",
  "uppfoljning_1",
  "uppfoljning_2",
  "uppfoljning_3",
  "inget_svar",
]);

export const Route = createFileRoute("/api/public/hooks/process-queued-sms")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = verifyCronAuth(request);
        if (denied) return denied;

        const { data: rows, error } = await supabaseAdmin
          .from("messages")
          .select("id, lead_id, to_phone, body, send_at, template_code")
          .eq("delivery_status", "queued")
          .not("send_at", "is", null)
          .lte("send_at", new Date().toISOString())
          .limit(50);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        // Central på/av-knapp för uppföljningar.
        const { data: settings } = await supabaseAdmin
          .from("company_settings")
          .select("followups_enabled")
          .limit(1)
          .maybeSingle();
        const followupsEnabled = (settings as any)?.followups_enabled !== false;

        const testMode = process.env.SMS_TEST_MODE === "true";
        let processed = 0;
        let failed = 0;
        let cancelled = 0;
        for (const row of rows ?? []) {
          if (!row.to_phone) continue;

          const isFollowup = (row.template_code ?? "").startsWith("followup_");
          if (isFollowup) {
            const { data: lead } = await supabaseAdmin
              .from("leads")
              .select("stage")
              .eq("id", row.lead_id)
              .maybeSingle();
            const stage = (lead as any)?.stage as string | undefined;
            const stillRelevant = !!stage && FOLLOWUP_OK_STAGES.has(stage);
            if (!followupsEnabled || !stillRelevant) {
              await supabaseAdmin
                .from("messages")
                .update({
                  delivery_status: "cancelled",
                  delivery_error: !followupsEnabled
                    ? "cancelled: followups_disabled"
                    : `cancelled: stage_${stage ?? "unknown"}`,
                })
                .eq("id", row.id);
              cancelled++;
              continue;
            }
          }

          const r = await dispatch(row.id, row.lead_id, row.to_phone, row.body, testMode);
          if (r.ok) processed++;
          else failed++;
        }
        return Response.json({ ok: true, processed, failed, cancelled, scanned: rows?.length ?? 0 });
      },
    },
  },
});
