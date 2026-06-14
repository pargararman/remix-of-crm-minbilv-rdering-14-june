// Direct browser-Supabase upsert. Bypassar useServerFn + attachSupabaseAuth
// (som annars väntar på getSession() före varje request — det är vad som gör
// att spinnern fastnar efter tab-switch). Riktig request-abort via
// .abortSignal(), hård 15s-timeout via withAbortableTimeout.
import { useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AUTH_EXPIRED_MESSAGE, isAuthError } from "@/lib/auth-recovery";
import { withAbortableTimeout } from "@/lib/with-abortable-timeout";

type Patch = Record<string, unknown>;
type CacheShape = { vehicle: Record<string, unknown> | null };

export function useVehicleMutation(leadId: string) {
  const qc = useQueryClient();
  const key = ["vehicle", leadId];

  // Cacha user-id EN gång vid mount — inte i save-pathen, så getUser() aldrig
  // kan blockera Spara.
  const userIdRef = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) userIdRef.current = data.user?.id ?? null;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const mutation = useMutation({
    mutationFn: async (patch: Patch) => {
      return withAbortableTimeout(
        async (signal) => {
          const clean: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(patch)) clean[k] = v ?? null;
          if (Object.keys(clean).length === 0) return { vehicle: null };

          console.debug("[vehicle-save] before supabase upsert", {
            ts: Date.now(),
            leadId,
          });

          const { data, error } = await supabase
            .from("vehicles")
            .upsert({ lead_id: leadId, ...clean } as never, { onConflict: "lead_id" })
            .select("*")
            .abortSignal(signal)
            .single();

          console.debug("[vehicle-save] after supabase upsert", {
            ts: Date.now(),
            leadId,
            hasData: !!data,
            error,
          });

          if (error) throw error;

          // Fire-and-forget timeline. Loggar ljudligt vid fel.
          void supabase
            .from("activity_timeline")
            .insert({
              lead_id: leadId,
              type: "vehicle_assessment_updated",
              description: `Bedömning uppdaterad: ${Object.keys(clean).join(", ")}`,
              actor_id: userIdRef.current,
              actor_type: "seller",
              metadata: { fields: Object.keys(clean) } as never,
            })
            .then(({ error: tlErr }) => {
              if (tlErr) console.error("[vehicle-save] timeline insert failed", tlErr);
            });

          return { vehicle: data };
        },
        15000,
        "Sparningen tog för lång tid. Försök igen.",
      );
    },
    retry: false,
    onMutate: async (patch) => {
      console.debug("[vehicle-save] onMutate start", {
        ts: Date.now(),
        leadId,
      });
      await qc.cancelQueries({ queryKey: key });
      console.debug("[vehicle-save] cancelQueries done", {
        ts: Date.now(),
        leadId,
      });
      const prev = qc.getQueryData<CacheShape>(key);
      qc.setQueryData<CacheShape>(key, (cur) => {
        const base = cur?.vehicle ?? {};
        return { vehicle: { ...base, ...patch } };
      });
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(key, ctx.prev);
      console.debug("[vehicle-save] onError", {
        ts: Date.now(),
        leadId,
        error: err,
      });
      console.error("[vehicle-save] failed", err);
      if (isAuthError(err as never)) {
        toast.error(AUTH_EXPIRED_MESSAGE);
      } else {
        toast.error(err instanceof Error ? err.message : "Kunde inte spara — försök igen");
      }
    },
    onSuccess: (res) => {
      console.debug("[vehicle-save] onSuccess", {
        ts: Date.now(),
        leadId,
      });
      if (res?.vehicle) {
        qc.setQueryData<CacheShape>(key, { vehicle: res.vehicle });
      }
      toast.success("Sparat");
    },
    onSettled: () => {
      console.debug("[vehicle-save] onSettled", {
        ts: Date.now(),
        leadId,
      });
    },
  });

  return {
    ...mutation,
    mutate: (patch: Patch, options?: Parameters<typeof mutation.mutate>[1]) => {
      console.debug("[vehicle-save] clicked", {
        ts: Date.now(),
        leadId,
        patch,
      });
      mutation.mutate(patch, options);
    },
    mutateAsync: (patch: Patch, options?: Parameters<typeof mutation.mutateAsync>[1]) => {
      console.debug("[vehicle-save] clicked", {
        ts: Date.now(),
        leadId,
        patch,
      });
      return mutation.mutateAsync(patch, options);
    },
  };
}
