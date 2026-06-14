// Server functions for lead tags.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { TAG_VALUES, TAG_LABEL } from "@/lib/tags";

const TagSchema = z.enum(TAG_VALUES as unknown as [string, ...string[]]);

export const listLeadTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ leadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("lead_tags")
      .select("tag")
      .eq("lead_id", data.leadId);
    if (error) throw error;
    return { tags: (rows ?? []).map((r) => r.tag as string) };
  });

export const addTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ leadId: z.string().uuid(), tag: TagSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("lead_tags")
      .insert({ lead_id: data.leadId, tag: data.tag, created_by: context.userId } as never);
    if (error && !error.message.includes("duplicate")) throw error;
    await context.supabase.from("activity_timeline").insert({
      lead_id: data.leadId,
      type: "tag_added",
      description: `Tagg tillagd: ${TAG_LABEL[data.tag] ?? data.tag}`,
      actor_id: context.userId,
      actor_type: "seller",
      metadata: { tag: data.tag } as never,
    });
    return { ok: true };
  });

export const removeTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ leadId: z.string().uuid(), tag: TagSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("lead_tags")
      .delete()
      .eq("lead_id", data.leadId)
      .eq("tag", data.tag);
    if (error) throw error;
    await context.supabase.from("activity_timeline").insert({
      lead_id: data.leadId,
      type: "tag_removed",
      description: `Tagg borttagen: ${TAG_LABEL[data.tag] ?? data.tag}`,
      actor_id: context.userId,
      actor_type: "seller",
      metadata: { tag: data.tag } as never,
    });
    return { ok: true };
  });
