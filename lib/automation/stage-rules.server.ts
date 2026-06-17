// Fas 3.1 — Stegförflyttnings-motor med matris, transitions-historik och stage_jobs.
// Använder DB-enum-värden från lead_stage.
// Övergångsmatrisen importeras från stage-docs.ts — EN källa till sanning.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { MANUAL_TRANSITIONS, type StageKey } from "@/lib/stage-docs";
import { cancelScheduledFollowups } from "@/lib/automation/schedule-followups.server";

export type Stage = StageKey;

// Stadier där automatiska kunduppföljnings-SMS inte längre är relevanta.
const FOLLOWUP_IRRELEVANT_STAGES: Stage[] = [
  "matchad",
  "bud_mottaget",
  "kund_accepterat",
  "kontrakt_pagar_avtal",
  "hamtning",
  "vunnen",
  "forlorad",
  "arkiverad",
];

export type TriggerType =
  | "manual"
  | "auto_sms_outbound"
  | "auto_sms_inbound"
  | "auto_followup"
  | "auto_call"
  | "auto_intake"
  | "auto_pricing"
  | "admin_override";

// Tillåtna övergångar — delas med UI:t via stage-docs.ts.
const MATRIX: Record<Stage, Stage[]> = MANUAL_TRANSITIONS;

export function isAllowed(from: Stage, to: Stage, isAdmin = false): boolean {
  if (from === to) return false;
  if (isAdmin) return true;
  return MATRIX[from]?.includes(to) ?? false;
}

export interface TransitionResult {
  success: boolean;
  new_stage?: Stage;
  error?: string;
}

export async function attemptStageTransition(
  leadId: string,
  toStage: Stage,
  triggerType: TriggerType,
  actorId: string | null = null,
  reason: string | null = null,
  metadata: Record<string, unknown> = {},
  isAdmin = false,
): Promise<TransitionResult> {
  const { data: lead, error: le } = await supabaseAdmin
    .from("leads")
    .select("id, stage")
    .eq("id", leadId)
    .maybeSingle();
  if (le || !lead) return { success: false, error: "Lead saknas" };
  const from = lead.stage as Stage;
  if (!isAllowed(from, toStage, isAdmin)) {
    return { success: false, error: `Övergång ej tillåten: ${from} → ${toStage}` };
  }

  const patch: Record<string, unknown> = {
    stage: toStage,
    last_activity_at: new Date().toISOString(),
  };
  if (toStage === "arkiverad") patch.archived_at = new Date().toISOString();

  const { error: ue } = await supabaseAdmin.from("leads").update(patch as never).eq("id", leadId);
  if (ue) return { success: false, error: ue.message };

  await supabaseAdmin.from("stage_transitions").insert({
    lead_id: leadId,
    from_stage: from,
    to_stage: toStage,
    trigger_type: triggerType,
    actor_id: actorId,
    reason,
    metadata: metadata as never,
  });
  await supabaseAdmin.from("activity_timeline").insert({
    lead_id: leadId,
    type: "stage_changed",
    description: `Steg ändrat: ${from} → ${toStage}`,
    actor_id: actorId,
    actor_type: actorId ? "seller" : "system",
    metadata: { from, to: toStage, trigger: triggerType, ...metadata } as never,
  });

  // Avbryt obsoleta stage_jobs för denna lead (utom de som siktar på samma stage).
  await supabaseAdmin
    .from("stage_jobs")
    .update({ status: "cancelled", cancelled_reason: `stage_changed_to_${toStage}` })
    .eq("lead_id", leadId)
    .eq("status", "pending")
    .neq("target_stage", toStage);

  // Avbryt köade kunduppföljnings-SMS när leadet lämnar kontaktfasen —
  // kunden ska inte få "är du fortfarande intresserad?" efter att bilen
  // publicerats, vunnits, förlorats eller arkiverats.
  if (FOLLOWUP_IRRELEVANT_STAGES.includes(toStage)) {
    try {
      await cancelScheduledFollowups(leadId, `stage_${toStage}`);
    } catch (e) {
      console.error("cancelScheduledFollowups failed:", e);
    }
  }

  return { success: true, new_stage: toStage };
}

export async function scheduleStageJob(
  leadId: string,
  targetStage: Stage,
  runAt: Date,
  triggerType: TriggerType = "auto_followup",
) {
  await supabaseAdmin.from("stage_jobs").insert({
    lead_id: leadId,
    target_stage: targetStage,
    trigger_type: triggerType,
    run_at: runAt.toISOString(),
    status: "pending",
  });
}

// Bakåtkompatibel adapter — gamla call-sites i Fas 2.x.
export type StageEvent =
  | { kind: "sms_inbound" }
  | { kind: "sms_outbound"; templateCode?: string | null }
  | { kind: "call_logged"; outcome: string };

export async function applyStageRule(_leadId: string, _event: StageEvent): Promise<Stage | null> {
  // Automatisk stegförflyttning är avstängd. Stegen ändras endast manuellt
  // av säljare/admin via UI. Behåller funktionen som no-op för bakåtkompat.
  return null;
}

