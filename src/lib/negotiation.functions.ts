// Negotiation log server functions.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ActorTypeSchema = z.enum(["customer", "seller", "dealer"]);

const ACTOR_LABEL: Record<string, string> = {
  customer: "Kund",
  seller: "Säljare",
  dealer: "Handlare",
};

export const listNegotiation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ leadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("negotiation_entries")
      .select("*")
      .eq("lead_id", data.leadId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { entries: rows ?? [] };
  });

export const addNegotiationEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        leadId: z.string().uuid(),
        actor_type: ActorTypeSchema,
        actor_id: z.string().uuid().nullable().optional(),
        amount: z.number().int().min(0).max(100000000).nullable().optional(),
        comment: z.string().max(2000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("negotiation_entries")
      .insert({
        lead_id: data.leadId,
        actor_type: data.actor_type,
        actor_id: data.actor_id ?? null,
        amount: data.amount ?? null,
        comment: data.comment ?? null,
        created_by: context.userId,
      } as never)
      .select()
      .single();
    if (error) throw error;
    await context.supabase.from("activity_timeline").insert({
      lead_id: data.leadId,
      type: "negotiation_entry_added",
      description: `Förhandling: ${ACTOR_LABEL[data.actor_type]}${data.amount ? ` ${data.amount.toLocaleString("sv-SE")} kr` : ""}`,
      actor_id: context.userId,
      actor_type: "seller",
      metadata: { actor_type: data.actor_type, amount: data.amount } as never,
    });
    return { entry: row };
  });
