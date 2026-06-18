// Server functions for notes (internal + dealer_visible).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const VisibilitySchema = z.enum(["internal", "dealer_visible"]);

export const listNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ leadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("notes")
      .select("*, author:profiles!notes_created_by_fkey(name)")
      .eq("lead_id", data.leadId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { notes: rows ?? [] };
  });

export const createNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        leadId: z.string().uuid(),
        visibility: VisibilitySchema,
        content: z.string().min(1).max(10000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("notes")
      .insert({
        lead_id: data.leadId,
        visibility: data.visibility,
        content: data.content,
        created_by: context.userId,
      } as never)
      .select()
      .single();
    if (error) throw error;
    await context.supabase.from("activity_timeline").insert({
      lead_id: data.leadId,
      type: "note_added",
      description: `Anteckning tillagd (${data.visibility === "internal" ? "intern" : "handlare"})`,
      actor_id: context.userId,
      actor_type: "seller",
      metadata: { visibility: data.visibility, note_id: (row as any).id } as never,
    });
    return { note: row };
  });

export const updateNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ noteId: z.string().uuid(), content: z.string().min(1).max(10000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("notes")
      .update({ content: data.content, updated_at: new Date().toISOString() } as never)
      .eq("id", data.noteId)
      .select()
      .single();
    if (error) throw error;
    await context.supabase.from("activity_timeline").insert({
      lead_id: (row as any).lead_id,
      type: "note_edited",
      description: "Anteckning redigerad",
      actor_id: context.userId,
      actor_type: "seller",
      metadata: { note_id: data.noteId } as never,
    });
    return { note: row };
  });

export const deleteNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ noteId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("notes")
      .select("lead_id, visibility")
      .eq("id", data.noteId)
      .maybeSingle();
    const { error } = await context.supabase.from("notes").delete().eq("id", data.noteId);
    if (error) throw error;
    if (existing) {
      await context.supabase.from("activity_timeline").insert({
        lead_id: (existing as any).lead_id,
        type: "note_deleted",
        description: "Anteckning raderad",
        actor_id: context.userId,
        actor_type: "seller",
        metadata: { visibility: (existing as any).visibility } as never,
      });
    }
    return { ok: true };
  });
