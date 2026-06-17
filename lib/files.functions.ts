// Server functions for lead files (photos + documents).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CATEGORIES = [
  "framifran","bakifran","vanster_sida","hoger_sida","interior","matarstallning","servicebok","skador","ovrigt",
] as const;

const MAX_FILES_PER_LEAD = 20;

export const listFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ leadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("files")
      .select("*")
      .eq("lead_id", data.leadId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    // Generate signed URLs for non-deleted files
    const enriched = await Promise.all(
      (rows ?? []).map(async (f: any) => {
        const bucket = f.file_type?.startsWith("image/") ? "lead-photos" : "lead-documents";
        const { data: signed } = await context.supabase.storage
          .from(bucket)
          .createSignedUrl(f.storage_path, 3600);
        let thumbUrl: string | null = null;
        if (f.thumbnail_url) {
          const { data: thumbSigned } = await context.supabase.storage
            .from("lead-photos")
            .createSignedUrl(f.thumbnail_url, 3600);
          thumbUrl = thumbSigned?.signedUrl ?? null;
        }
        return { ...f, signed_url: signed?.signedUrl ?? null, thumb_signed_url: thumbUrl };
      }),
    );
    return { files: enriched };
  });

export const registerFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        leadId: z.string().uuid(),
        storage_path: z.string().min(1).max(500),
        thumbnail_path: z.string().nullable().optional(),
        file_type: z.string().max(100),
        file_size_bytes: z.number().int().min(0).max(100_000_000),
        category: z.enum(CATEGORIES).nullable().optional(),
        caption: z.string().max(500).nullable().optional(),
        visible_to_dealer: z.boolean().default(false),
        width: z.number().int().nullable().optional(),
        height: z.number().int().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { count } = await context.supabase
      .from("files")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", data.leadId)
      .is("deleted_at", null);
    if ((count ?? 0) >= MAX_FILES_PER_LEAD) {
      throw new Error(`Max ${MAX_FILES_PER_LEAD} filer per lead`);
    }
    const { data: row, error } = await context.supabase
      .from("files")
      .insert({
        lead_id: data.leadId,
        storage_path: data.storage_path,
        thumbnail_url: data.thumbnail_path ?? null,
        file_type: data.file_type,
        file_size_bytes: data.file_size_bytes,
        category: (data.category ?? "ovrigt") as never,
        caption: data.caption ?? null,
        visible_to_dealer: data.visible_to_dealer ?? false,
        width: data.width ?? null,
        height: data.height ?? null,
        uploaded_by: context.userId,
      } as never)
      .select()
      .single();
    if (error) throw error;
    await context.supabase.from("activity_timeline").insert({
      lead_id: data.leadId,
      type: "file_uploaded",
      description: `Fil tillagd (${data.category ?? "ovrigt"})`,
      actor_id: context.userId,
      actor_type: "seller",
      metadata: { file_id: (row as any).id, category: data.category } as never,
    });
    return { file: row };
  });

export const updateFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        fileId: z.string().uuid(),
        category: z.enum(CATEGORIES).optional(),
        caption: z.string().max(500).nullable().optional(),
        visible_to_dealer: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.category !== undefined) patch.category = data.category;
    if (data.caption !== undefined) patch.caption = data.caption;
    if (data.visible_to_dealer !== undefined) patch.visible_to_dealer = data.visible_to_dealer;

    const { data: row, error } = await context.supabase
      .from("files")
      .update(patch as never)
      .eq("id", data.fileId)
      .select()
      .single();
    if (error) throw error;

    if (data.visible_to_dealer !== undefined) {
      await context.supabase.from("activity_timeline").insert({
        lead_id: (row as any).lead_id,
        type: "file_visibility_changed",
        description: `Synlighet ändrad: ${data.visible_to_dealer ? "synlig för handlare" : "endast intern"}`,
        actor_id: context.userId,
        actor_type: "seller",
        metadata: { file_id: data.fileId, visible_to_dealer: data.visible_to_dealer } as never,
      });
    }
    return { file: row };
  });

export const deleteFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ fileId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: file } = await context.supabase
      .from("files")
      .select("lead_id, storage_path, thumbnail_url, file_type")
      .eq("id", data.fileId)
      .maybeSingle();
    if (!file) throw new Error("Fil saknas");
    const bucket = (file as any).file_type?.startsWith("image/") ? "lead-photos" : "lead-documents";
    await context.supabase.storage.from(bucket).remove([(file as any).storage_path]);
    if ((file as any).thumbnail_url) {
      await context.supabase.storage.from("lead-photos").remove([(file as any).thumbnail_url]);
    }
    const { error } = await context.supabase.from("files").delete().eq("id", data.fileId);
    if (error) throw error;
    await context.supabase.from("activity_timeline").insert({
      lead_id: (file as any).lead_id,
      type: "file_deleted",
      description: "Fil raderad",
      actor_id: context.userId,
      actor_type: "seller",
      metadata: { file_id: data.fileId } as never,
    });
    return { ok: true };
  });

export const bulkSetDealerVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ leadId: z.string().uuid(), visible: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("files")
      .update({ visible_to_dealer: data.visible } as never)
      .eq("lead_id", data.leadId)
      .is("deleted_at", null);
    if (error) throw error;
    await context.supabase.from("activity_timeline").insert({
      lead_id: data.leadId,
      type: "file_visibility_changed",
      description: data.visible ? "Alla filer godkända för handlare" : "Alla filer dolda från handlare",
      actor_id: context.userId,
      actor_type: "seller",
      metadata: { bulk: true, visible: data.visible } as never,
    });
    return { ok: true };
  });
