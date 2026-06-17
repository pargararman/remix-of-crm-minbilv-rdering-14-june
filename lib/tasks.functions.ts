// Tasks server functions.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listMyTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ scope: z.enum(["today", "all", "lead"]).default("today"), leadId: z.string().uuid().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase
      .from("tasks")
      .select("*, lead:leads(id, customer_name, registration_number)")
      .order("due_date", { ascending: true, nullsFirst: false });

    if (data.scope === "lead" && data.leadId) {
      q = q.eq("lead_id", data.leadId);
    } else if (data.scope === "today") {
      q = q.eq("owner_id", userId).in("status", ["open", "snoozed"]);
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);
      q = q.lte("due_date", endOfToday.toISOString());
    } else {
      q = q.eq("owner_id", userId);
    }

    const { data: rows, error } = await q.limit(100);
    if (error) throw error;

    // Attach creator names via a separate lookup (no FK relation exists
    // between tasks.created_by and profiles.id in the schema cache).
    const creatorIds = Array.from(
      new Set((rows ?? []).map((r: any) => r.created_by).filter(Boolean)),
    );
    let creatorMap: Record<string, { name: string | null }> = {};
    if (creatorIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, name")
        .in("id", creatorIds);
      creatorMap = Object.fromEntries((profs ?? []).map((p: any) => [p.id, { name: p.name }]));
    }
    const tasks = (rows ?? []).map((r: any) => ({
      ...r,
      creator: r.created_by ? creatorMap[r.created_by] ?? null : null,
    }));
    return { tasks };
  });

export const createTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        leadId: z.string().uuid(),
        title: z.string().min(1).max(200),
        due_date: z.string().nullable().optional(),
        reminder_time: z.string().nullable().optional(),
        owner_id: z.string().uuid().nullable().optional(),
        kind: z.string().max(50).default("manual"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("tasks")
      .insert({
        lead_id: data.leadId,
        title: data.title,
        due_date: data.due_date ?? null,
        reminder_time: data.reminder_time ?? null,
        owner_id: data.owner_id ?? context.userId,
        kind: data.kind,
        created_by: context.userId,
      } as never)
      .select()
      .single();
    if (error) throw error;
    await context.supabase.from("activity_timeline").insert({
      lead_id: data.leadId,
      type: "task_created",
      description: `Task skapad: ${data.title}`,
      actor_id: context.userId,
      actor_type: "seller",
      metadata: { task_id: (row as any).id } as never,
    });
    return { task: row };
  });

export const completeTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ taskId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("tasks")
      .update({
        status: "completed" as never,
        completed_at: new Date().toISOString(),
        completed_by: context.userId,
      } as never)
      .eq("id", data.taskId)
      .select()
      .single();
    if (error) throw error;
    await context.supabase.from("activity_timeline").insert({
      lead_id: (row as any).lead_id,
      type: "task_completed",
      description: `Task klar: ${(row as any).title}`,
      actor_id: context.userId,
      actor_type: "seller",
      metadata: { task_id: data.taskId } as never,
    });
    return { task: row };
  });

export const snoozeTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ taskId: z.string().uuid(), snoozed_until: z.string() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("tasks")
      .update({ status: "snoozed" as never, snoozed_until: data.snoozed_until } as never)
      .eq("id", data.taskId)
      .select()
      .single();
    if (error) throw error;
    await context.supabase.from("activity_timeline").insert({
      lead_id: (row as any).lead_id,
      type: "task_snoozed",
      description: `Task uppskjuten`,
      actor_id: context.userId,
      actor_type: "seller",
      metadata: { task_id: data.taskId, snoozed_until: data.snoozed_until } as never,
    });
    return { task: row };
  });

export const deleteTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ taskId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("tasks").delete().eq("id", data.taskId);
    if (error) throw error;
    return { ok: true };
  });

export const listCalendarEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ from: z.string(), to: z.string() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [{ data: tasks }, { data: calls }, { data: queued }] = await Promise.all([
      supabase
        .from("tasks")
        .select("id, title, due_date, lead_id, status, lead:leads(customer_name, registration_number)")
        .eq("owner_id", userId)
        .gte("due_date", data.from)
        .lte("due_date", data.to)
        .in("status", ["open", "snoozed"]),
      supabase
        .from("call_logs")
        .select("id, next_contact_at, lead_id, lead:leads(customer_name, registration_number)")
        .eq("seller_id", userId)
        .gte("next_contact_at", data.from)
        .lte("next_contact_at", data.to),
      supabase
        .from("messages")
        .select("id, send_at, lead_id, body, lead:leads(customer_name, registration_number)")
        .eq("direction", "outbound")
        .eq("delivery_status", "queued")
        .gte("send_at", data.from)
        .lte("send_at", data.to),
    ]);
    const events = [
      ...((tasks ?? []) as any[]).map((t) => ({
        kind: "task" as const,
        id: t.id,
        when: t.due_date,
        title: t.title,
        lead_id: t.lead_id,
        lead: t.lead,
      })),
      ...((calls ?? []) as any[]).map((c) => ({
        kind: "callback" as const,
        id: c.id,
        when: c.next_contact_at,
        title: "Återuppringning",
        lead_id: c.lead_id,
        lead: c.lead,
      })),
      ...((queued ?? []) as any[]).map((m) => ({
        kind: "sms" as const,
        id: m.id,
        when: m.send_at,
        title: `SMS: ${(m.body ?? "").slice(0, 40)}`,
        lead_id: m.lead_id,
        lead: m.lead,
      })),
    ].filter((e) => e.when).sort((a, b) => a.when!.localeCompare(b.when!));
    return { events };
  });
