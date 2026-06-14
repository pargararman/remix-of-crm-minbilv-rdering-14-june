// Cron-worker: processa schemalagda stegförflyttningar var 5:e min.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  attemptStageTransition,
  scheduleStageJob,
  type Stage,
} from "@/lib/automation/stage-rules.server";
import { sendSms } from "@/lib/sms/send.server";
import { verifyCronAuth } from "@/lib/cron-auth.server";

// Vilka stadier är fortfarande relevanta för ett visst job-mål?
function isEligible(current: Stage, target: Stage): boolean {
  if (current === target) return false;
  if (["vunnen", "forlorad", "arkiverad"].includes(current)) return false;
  if (target.startsWith("uppfoljning_") || target === "inget_svar") {
    // Bara om kunden inte hunnit svara / vi inte flyttat fram.
    return ["kontaktad", "uppfoljning_1", "uppfoljning_2", "uppfoljning_3", "inget_svar"].includes(current);
  }
  if (target === "arkiverad") return current === "inget_svar";
  return true;
}

export const Route = createFileRoute("/api/public/hooks/process-stage-jobs")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = verifyCronAuth(request);
        if (denied) return denied;
        const { data: jobs, error } = await supabaseAdmin
          .from("stage_jobs")
          .select("*")
          .eq("status", "pending")
          .lte("run_at", new Date().toISOString())
          .order("run_at", { ascending: true })
          .limit(100);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        let processed = 0;
        let cancelled = 0;
        let failed = 0;
        const { data: settings } = await supabaseAdmin
          .from("company_settings")
          .select("followup_2_hours, followup_3_hours, inget_svar_hours, auto_archive_days")
          .limit(1)
          .maybeSingle();
        const f2 = settings?.followup_2_hours ?? 48;
        const f3 = settings?.followup_3_hours ?? 72;
        const fi = settings?.inget_svar_hours ?? 24;
        const archDays = settings?.auto_archive_days ?? 30;

        for (const job of jobs ?? []) {
          const { data: lead } = await supabaseAdmin
            .from("leads")
            .select("stage")
            .eq("id", job.lead_id)
            .maybeSingle();
          if (!lead) {
            await supabaseAdmin
              .from("stage_jobs")
              .update({ status: "cancelled", cancelled_reason: "lead_missing", executed_at: new Date().toISOString() })
              .eq("id", job.id);
            cancelled++;
            continue;
          }
          if (!isEligible(lead.stage as Stage, job.target_stage as Stage)) {
            await supabaseAdmin
              .from("stage_jobs")
              .update({
                status: "cancelled",
                cancelled_reason: `current_stage_${lead.stage}`,
                executed_at: new Date().toISOString(),
              })
              .eq("id", job.id);
            cancelled++;
            continue;
          }

          const r = await attemptStageTransition(
            job.lead_id,
            job.target_stage as Stage,
            "auto_followup",
            null,
            "Schemalagt jobb",
          );
          if (!r.success) {
            await supabaseAdmin
              .from("stage_jobs")
              .update({
                status: "failed",
                cancelled_reason: r.error ?? "unknown",
                executed_at: new Date().toISOString(),
              })
              .eq("id", job.id);
            failed++;
            continue;
          }

          const t = job.target_stage as Stage;
          // Skicka motsvarande uppföljnings-SMS via existerande pipeline (respekterar tystnad-timme).
          if (t === "uppfoljning_1" || t === "uppfoljning_2" || t === "uppfoljning_3") {
            const idx = t.split("_")[1];
            // Dubblettspärr: intake-flödet köar redan followup-SMS som
            // messages-rader. Skicka INTE samma mall igen om en rad redan
            // finns (köad eller skickad) för detta lead.
            const { data: existing } = await supabaseAdmin
              .from("messages")
              .select("id")
              .eq("lead_id", job.lead_id)
              .eq("template_code", `followup_${idx}`)
              .in("delivery_status", ["queued", "sent", "delivered"])
              .limit(1)
              .maybeSingle();
            const { data: cs } = await supabaseAdmin
              .from("company_settings")
              .select("followups_enabled")
              .limit(1)
              .maybeSingle();
            if (!existing && (cs as any)?.followups_enabled !== false) {
              try {
                await sendSms({
                  leadId: job.lead_id,
                  templateCode: `followup_${idx}`,
                  isSystem: true,
                });
              } catch (e) {
                console.error("auto followup SMS failed:", e);
              }
            }
            // Schemalägg nästa steg.
            if (t === "uppfoljning_1") {
              await scheduleStageJob(job.lead_id, "uppfoljning_2", new Date(Date.now() + f2 * 3600_000));
            } else if (t === "uppfoljning_2") {
              await scheduleStageJob(job.lead_id, "uppfoljning_3", new Date(Date.now() + f3 * 3600_000));
            } else {
              await scheduleStageJob(job.lead_id, "inget_svar", new Date(Date.now() + fi * 3600_000));
            }
          } else if (t === "inget_svar") {
            await scheduleStageJob(
              job.lead_id,
              "arkiverad",
              new Date(Date.now() + archDays * 86400_000),
            );
          }

          await supabaseAdmin
            .from("stage_jobs")
            .update({ status: "done", executed_at: new Date().toISOString() })
            .eq("id", job.id);
          processed++;
        }

        return Response.json({ processed, cancelled, failed, scanned: jobs?.length ?? 0 });
      },
    },
  },
});
