// Server functions: samtalsloggning.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { applyStageRule } from "@/lib/automation/stage-rules.server";
import { sendSms } from "@/lib/sms/send.server";

const OUTCOMES = ["ringde", "inget_svar", "pratade", "fel_nummer", "ring_igen"] as const;

export const logCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        leadId: z.string().uuid(),
        outcome: z.enum(OUTCOMES),
        summary: z.string().max(2000).optional(),
        nextContactAt: z.string().datetime().optional(),
        durationSeconds: z.number().int().min(0).max(86400).optional(),
        sendMissedCallSms: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: call, error } = await context.supabase
      .from("call_logs")
      .insert({
        lead_id: data.leadId,
        seller_id: context.userId,
        outcome: data.outcome,
        summary: data.summary ?? null,
        next_contact_at: data.nextContactAt ?? null,
        duration_seconds: data.durationSeconds ?? null,
      })
      .select("id, created_at, outcome, summary, next_contact_at, duration_seconds")
      .single();
    if (error) throw error;

    await context.supabase.from("activity_timeline").insert({
      lead_id: data.leadId,
      type: "call_logged",
      description: `Samtal: ${data.outcome}`,
      actor_id: context.userId,
      actor_type: "seller",
      metadata: { outcome: data.outcome, summary: data.summary ?? null },
    });
    await context.supabase
      .from("leads")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", data.leadId);

    // Auto-task från next_contact_at
    if (data.nextContactAt) {
      const { data: lead } = await context.supabase
        .from("leads")
        .select("customer_name, owner_id")
        .eq("id", data.leadId)
        .maybeSingle();
      const { error: taskErr } = await context.supabase.from("tasks").insert({
        lead_id: data.leadId,
        title: `Ring ${lead?.customer_name ?? "kund"}`,
        due_date: data.nextContactAt,
        owner_id: lead?.owner_id ?? context.userId,
        kind: "followup_call",
      });
      // Samtalet är redan loggat — men säg till om påminnelsen INTE skapades
      // så säljaren inte litar på en uppgift som saknas.
      if (taskErr) {
        console.error("auto-task insert failed:", taskErr.message);
        throw new Error(
          `Samtalet loggades, men påminnelse-uppgiften kunde inte skapas (${taskErr.message}). Skapa den manuellt.`,
        );
      }
    }

    // Auto-stage från utfall
    try {
      await applyStageRule(data.leadId, { kind: "call_logged", outcome: data.outcome });
    } catch (e) {
      console.error("applyStageRule (call_logged) failed:", e);
    }

    // Valfritt missed-call-SMS vid no-answer
    if (data.sendMissedCallSms && data.outcome === "inget_svar") {
      await sendSms({
        leadId: data.leadId,
        templateCode: "missed_call",
        senderId: context.userId,
        isSystem: false,
        bypassQuietHours: true,
      });
    }

    return { call };
  });

export const listCalls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ leadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("call_logs")
      .select("id, seller_id, outcome, summary, next_contact_at, duration_seconds, created_at")
      .eq("lead_id", data.leadId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { calls: rows ?? [] };
  });
