import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bell, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import {
  listMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/notifications.functions";
import { formatRelative } from "@/lib/format";

export function NotificationBell() {
  const list = useServerFn(listMyNotifications);
  const markOne = useServerFn(markNotificationRead);
  const markAll = useServerFn(markAllNotificationsRead);
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => list(),
    refetchInterval: 60_000,
  });

  // Realtime subscription
  useEffect(() => {
    let userId: string | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    supabase.auth.getSession().then(({ data: s }) => {
      if (!s.session) return;
      userId = s.session.user.id;
      channel = supabase
        .channel(`notif-${userId}-${Math.random().toString(36).slice(2)}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
          (payload) => {
            qc.invalidateQueries({ queryKey: ["notifications"] });
            const n = payload.new as { title?: string; body?: string };
            if (typeof Notification !== "undefined" && Notification.permission === "granted") {
              try {
                new Notification(n.title ?? "Ny notis", { body: n.body ?? "" });
              } catch {
                /* ignore */
              }
            }
          },
        )
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            if (retryTimer) clearTimeout(retryTimer);
            retryTimer = setTimeout(() => {
              try {
                channel?.subscribe();
              } catch {
                /* ignore */
              }
            }, 3000);
          }
        });
    });
    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [qc]);

  const oneMut = useMutation({
    mutationFn: (id: string) => markOne({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const allMut = useMutation({
    mutationFn: () => markAll(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const unread = data?.unread ?? 0;
  const notifications = data?.notifications ?? [];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notifieringar" className="relative">
          <Bell className="h-[1.1rem] w-[1.1rem]" />
          {unread > 0 && (
            <Badge className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px]" variant="destructive">
              {unread > 9 ? "9+" : unread}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between p-3 border-b border-border">
          <span className="font-medium text-sm">Notifieringar</span>
          {unread > 0 && (
            <Button size="sm" variant="ghost" onClick={() => allMut.mutate()} disabled={allMut.isPending}>
              <Check className="h-3.5 w-3.5 mr-1" /> Markera alla
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-auto">
          {notifications.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Inga notiser</div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className={`p-3 border-b border-border last:border-0 ${!n.read_at ? "bg-elevated" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{n.title}</div>
                    {n.body && <div className="text-xs text-muted-foreground mt-0.5">{n.body}</div>}
                    <div className="text-[11px] text-muted-foreground mt-1">{formatRelative(n.created_at)}</div>
                  </div>
                  {!n.read_at && (
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => oneMut.mutate(n.id)} aria-label="Markera läst">
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                {n.lead_id && (
                  <Link
                    to="/leads/$leadId"
                    params={{ leadId: n.lead_id }}
                    className="text-xs text-primary hover:underline mt-1 inline-block"
                  >
                    Öppna lead →
                  </Link>
                )}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
