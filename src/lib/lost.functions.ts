// Mark-lost flow.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attemptStageTransition, scheduleStageJob } from "@/lib/automation/stage-rules.server";
import { LOST_REASONS } from "@/lib/lost-reasons";

const ReasonEnum = z.enum(LOST_REASONS.map((r) => r.value) as unknown as [string, ...string[]]);

export const markLeadLost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        leadId: z.string().uuid(),
        lost_reason_code: ReasonEnum,
        lost_reason_text: z.string().max(2000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Spara orsaken FÖRST — misslyckas den ska hela åtgärden misslyckas och
    // kunna göras om. (Tidigare byttes stage först; ett tyst orsaksfel gav då
    // en förlorad lead utan orsak, och retry blockerades av matrisen.)
    const { error: reasonErr } = await context.supabase
      .from("leads")
      .update({
        lost_reason_code: data.lost_reason_code as never,
        lost_reason_text: data.lost_reason_text ?? null,
      } as never)
      .eq("id", data.leadId);
    if (reasonErr) throw new Error(`Kunde inte spara förlustorsak: ${reasonErr.message}`);

    // Transition via stage engine.
    const r = await attemptStageTransition(
      data.leadId,
      "forlorad",
      "manual",
      context.userId,
      data.lost_reason_text ?? null,
      { lost_reason_code: data.lost_reason_code },
    );
    if (!r.success) throw new Error(r.error ?? "Kunde inte markera som förlorad");

    // Cancel pending tasks.
    await context.supabase
      .from("tasks")
      .update({ status: "cancelled" as never } as never)
      .eq("lead_id", data.leadId)
      .in("status", ["open", "snoozed"]);

    // Timeline event.
    await context.supabase.from("activity_timeline").insert({
      lead_id: data.leadId,
      type: "lost_marked",
      description: `Markerad som förlorad: ${LOST_REASONS.find((r) => r.value === data.lost_reason_code)?.label}`,
      actor_id: context.userId,
      actor_type: "seller",
      metadata: { code: data.lost_reason_code, text: data.lost_reason_text } as never,
    });

    // Schedule auto-archive +30 days.
    await scheduleStageJob(
      data.leadId,
      "arkiverad",
      new Date(Date.now() + 30 * 24 * 3600_000),
      "auto_followup",
    );

    return { ok: true };
  });
