// Lyssnar på meddelandetabellen och invaliderar relevanta queries
// så att SMS-inkorg och olästa-badges uppdateras live.
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useInboxRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const channelName = `inbox:messages:${Math.random().toString(36).slice(2)}`;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const ch = supabase.channel(channelName);
    ch.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      () => {
        qc.invalidateQueries({ queryKey: ["conversations"] });
        qc.invalidateQueries({ queryKey: ["unread-counts"] });
      },
    )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        () => {
          qc.invalidateQueries({ queryKey: ["conversations"] });
          qc.invalidateQueries({ queryKey: ["unread-counts"] });
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          if (retryTimer) clearTimeout(retryTimer);
          retryTimer = setTimeout(() => {
            try {
              ch.subscribe();
            } catch {
              /* ignore */
            }
          }, 3000);
        }
      });
    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      supabase.removeChannel(ch);
    };
  }, [qc]);
}
