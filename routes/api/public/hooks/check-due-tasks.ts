// Cron-route: skapar notifikationer när tasks är nära förfall.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyCronAuth } from "@/lib/cron-auth.server";

export const Route = createFileRoute("/api/public/hooks/check-due-tasks")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = verifyCronAuth(request);
        if (denied) return denied;
        const horizon = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        const { data: tasks } = await supabaseAdmin
          .from("tasks")
          .select("id, lead_id, owner_id, title, due_date")
          .eq("status", "open")
          .is("notified_at", null)
          .not("due_date", "is", null)
          .lte("due_date", horizon)
          .limit(100);

        let notified = 0;
        for (const t of tasks ?? []) {
          if (!t.owner_id) continue;
          await supabaseAdmin.from("notifications").insert({
            user_id: t.owner_id,
            lead_id: t.lead_id,
            type: "task_due_soon",
            title: "Uppgift snart förfallen",
            body: t.title,
          });
          await supabaseAdmin
            .from("tasks")
            .update({ notified_at: new Date().toISOString() })
            .eq("id", t.id);
          notified++;
        }
        return Response.json({ ok: true, notified, scanned: tasks?.length ?? 0 });
      },
    },
  },
});
