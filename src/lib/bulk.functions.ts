// Bulk actions for leads. Returns count of affected ids.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const idsSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) });

export const bulkArchiveLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("leads")
      .update({ archived_at: new Date().toISOString() })
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { count: data.ids.length };
  });

export const bulkAssignLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    idsSchema.extend({ ownerId: z.string().uuid().nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("leads")
      .update({ owner_id: data.ownerId })
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { count: data.ids.length };
  });

const stageSchema = idsSchema.extend({
  stage: z.enum([
    "ny_lead", "snabb_vardering", "kontaktad", "uppfoljning_1",
    "uppfoljning_2", "uppfoljning_3", "inget_svar", "matchad",
    "bud_mottaget", "kund_accepterat", "hamtning", "vunnen",
    "forlorad", "arkiverad",
  ]),
});

export const bulkChangeStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => stageSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("leads")
      .update({ stage: data.stage })
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { count: data.ids.length };
  });

const tagSchema = idsSchema.extend({ tag: z.string().min(1).max(50) });

export const bulkAddTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => tagSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const rows = data.ids.map((lead_id) => ({ lead_id, tag: data.tag }));
    const { error } = await supabase.from("lead_tags").upsert(rows, { onConflict: "lead_id,tag" });
    if (error) throw new Error(error.message);
    return { count: rows.length };
  });
