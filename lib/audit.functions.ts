import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const filterSchema = z.object({
  userId: z.string().uuid().optional().nullable(),
  action: z.string().max(100).optional().nullable(),
  objectType: z.string().max(100).optional().nullable(),
  fromDate: z.string().optional().nullable(),
  toDate: z.string().optional().nullable(),
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0),
});

export const listAuditLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => filterSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("audit_logs")
      .select("id, user_id, action, object_type, object_id, old_value, new_value, user_agent, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (data.userId) q = q.eq("user_id", data.userId);
    if (data.action) q = q.eq("action", data.action);
    if (data.objectType) q = q.eq("object_type", data.objectType);
    if (data.fromDate) q = q.gte("created_at", data.fromDate);
    if (data.toDate) q = q.lte("created_at", data.toDate);
    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);

    const userIds = Array.from(new Set((rows ?? []).map((r) => r.user_id).filter(Boolean) as string[]));
    let users: Record<string, { name: string | null; email: string | null }> = {};
    if (userIds.length) {
      const { data: profs } = await supabase.from("profiles").select("id, name, email").in("id", userIds);
      users = Object.fromEntries((profs ?? []).map((p) => [p.id, { name: p.name, email: p.email }]));
    }
    return { rows: rows ?? [], count: count ?? 0, users };
  });

export const listAuditActions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data } = await supabase.from("audit_logs").select("action").limit(2000);
    const actions = Array.from(new Set((data ?? []).map((r) => r.action))).sort();
    return { actions };
  });
