// Server-funktioner för full pricing-modul + historik + auto-stage-trigger.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";


const FIELDS = [
  "valuation_from",
  "valuation_to",
  "in_price_from",
  "in_price_to",
  "out_price_from",
  "out_price_to",
  "customer_expectation",
  "pricing_notes",
] as const;
type Field = (typeof FIELDS)[number];

const FIELD_LABEL: Record<Field, string> = {
  valuation_from: "Värdering från",
  valuation_to: "Värdering till",
  in_price_from: "Inpris från",
  in_price_to: "Inpris till",
  out_price_from: "Utpris från",
  out_price_to: "Utpris till",
  customer_expectation: "Kundens förväntan",
  pricing_notes: "Priskommentar",
};

export const getPricing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ leadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: pricing } = await context.supabase
      .from("pricing")
      .select("*, updater:profiles!pricing_updated_by_fkey(name)")
      .eq("lead_id", data.leadId)
      .maybeSingle();
    return { pricing };
  });

export const updatePricing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        leadId: z.string().uuid(),
        valuation_from: z.number().int().min(0).max(100000000).nullable().optional(),
        valuation_to: z.number().int().min(0).max(100000000).nullable().optional(),
        in_price_from: z.number().int().min(0).max(100000000).nullable().optional(),
        in_price_to: z.number().int().min(0).max(100000000).nullable().optional(),
        out_price_from: z.number().int().min(0).max(100000000).nullable().optional(),
        out_price_to: z.number().int().min(0).max(100000000).nullable().optional(),
        customer_expectation: z.number().int().min(0).max(100000000).nullable().optional(),
        pricing_notes: z.string().max(2000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = { lead_id: data.leadId, updated_by: context.userId };
    const submitted: Field[] = [];
    for (const f of FIELDS) {
      if (f in data) {
        patch[f] = (data as any)[f] ?? null;
        submitted.push(f);
      }
    }
    if (submitted.length === 0) return { ok: true, changed: 0, pricing: null };

    // Legacy-spegling.
    if ("in_price_from" in patch) patch.in_price = patch.in_price_from;
    if ("out_price_from" in patch) patch.out_price = patch.out_price_from;

    const supabase = context.supabase;
    const userId = context.userId;
    const leadId = data.leadId;

    // EN upsert. Returnera färska raden så klienten kan uppdatera cachen utan refetch.
    const { data: pricing, error: upErr } = await supabase
      .from("pricing")
      .upsert(patch as never, { onConflict: "lead_id" })
      .select("*, updater:profiles!pricing_updated_by_fkey(name)")
      .single();
    if (upErr) throw upErr;

    // Bakgrund: history-rader, timeline-rader, last_activity_at.
    queueMicrotask(() => {
      void (async () => {
        try {
          const { data: existing } = await supabase
            .from("pricing")
            .select("*")
            .eq("lead_id", leadId)
            .maybeSingle();
          const changes: { field: Field; old: unknown; new: unknown }[] = [];
          for (const f of submitted) {
            const newVal = (patch as any)[f] ?? null;
            const oldVal = existing ? (existing as any)[f] ?? null : null;
            if (String(newVal) !== String(oldVal)) {
              changes.push({ field: f, old: oldVal, new: newVal });
            }
          }
          if (changes.length === 0) return;
          await Promise.all([
            supabase.from("pricing_history").insert(
              changes.map((c) => ({
                lead_id: leadId,
                field_name: c.field,
                old_value: c.old == null ? null : String(c.old),
                new_value: c.new == null ? null : String(c.new),
                changed_by: userId,
              })),
            ),
            supabase.from("activity_timeline").insert(
              changes.map((c) => ({
                lead_id: leadId,
                type: "price_updated",
                description: `Pris uppdaterat: ${FIELD_LABEL[c.field]} ${c.old ?? "(tom)"} → ${c.new ?? "(tom)"}`,
                actor_id: userId,
                actor_type: "seller",
                metadata: { field: c.field, old: c.old, new: c.new } as never,
              })),
            ),
            supabase
              .from("leads")
              .update({ last_activity_at: new Date().toISOString() })
              .eq("id", leadId),
          ]);
        } catch (e) {
          console.error("updatePricing background writes failed", e);
        }
      })();
    });

    return { ok: true, changed: submitted.length, pricing };
  });


export const listPricingHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ leadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("pricing_history")
      .select("*, changer:profiles!pricing_history_changed_by_fkey(name)")
      .eq("lead_id", data.leadId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { history: rows ?? [], labels: FIELD_LABEL };
  });

export const listStageTransitions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ leadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("stage_transitions")
      .select("*, actor:profiles!stage_transitions_actor_id_fkey(name)")
      .eq("lead_id", data.leadId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { transitions: rows ?? [] };
  });

// Admin: lead-score-vikter.
export const getLeadScoreWeights = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("company_settings")
      .select("id, lead_score_weights")
      .limit(1)
      .maybeSingle();
    return { id: data?.id, weights: data?.lead_score_weights ?? {} };
  });

export const updateLeadScoreWeights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        weights: z.record(z.string(), z.number().int().min(-100).max(100)),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("role")
      .eq("id", context.userId)
      .maybeSingle();
    if (profile?.role !== "admin") throw new Error("Endast admin");

    const { data: old } = await supabaseAdmin
      .from("company_settings")
      .select("lead_score_weights")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await supabaseAdmin
      .from("company_settings")
      .update({ lead_score_weights: data.weights })
      .eq("id", data.id);
    if (error) throw error;
    await supabaseAdmin.from("audit_logs").insert({
      user_id: context.userId,
      action: "lead_score_weights_updated",
      object_type: "company_settings",
      object_id: data.id,
      old_value: old?.lead_score_weights as any,
      new_value: data.weights as any,
    });
    return { ok: true };
  });

// Räkna om alla aktiva leads (admin manuell knapp).
export const recomputeAllLeadScores = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("role")
      .eq("id", context.userId)
      .maybeSingle();
    if (profile?.role !== "admin") throw new Error("Endast admin");

    const { data: ids } = await supabaseAdmin
      .from("leads")
      .select("id")
      .is("archived_at", null);
    let n = 0;
    for (const row of ids ?? []) {
      const { data: scoreVal } = await supabaseAdmin.rpc("compute_lead_score", { p_lead_id: row.id });
      if (scoreVal != null) {
        await supabaseAdmin.from("leads").update({ lead_score: scoreVal as number }).eq("id", row.id);
        n++;
      }
    }
    return { updated: n };
  });
