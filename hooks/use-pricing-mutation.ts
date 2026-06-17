// Anropar transaktionell RPC save_pricing — atomisk upsert + diff +
// pricing_history + activity_timeline + leads.last_activity_at. Inga
// fire-and-forget audit-skrivningar. Riktig request-abort via
// .abortSignal(), hård 15s-timeout via withAbortableTimeout.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AUTH_EXPIRED_MESSAGE, isAuthError } from "@/lib/auth-recovery";
import { withAbortableTimeout } from "@/lib/with-abortable-timeout";

type Patch = Record<string, unknown>;
type CacheShape = { pricing: Record<string, unknown> | null };

export function usePricingMutation(leadId: string) {
  const qc = useQueryClient();
  const key = ["pricing", leadId];

  const mutation = useMutation({
    mutationFn: async (patch: Patch) => {
      return withAbortableTimeout(
        async (signal) => {
          console.debug("[pricing-save] before rpc save_pricing", {
            ts: Date.now(),
            leadId,
          });

          const { data, error } = await supabase
            .rpc("save_pricing", { p_lead_id: leadId, p_patch: patch as never })
            .abortSignal(signal);

          console.debug("[pricing-save] after rpc save_pricing", {
            ts: Date.now(),
            leadId,
            hasData: !!data,
            error,
          });

          if (error) throw error;
          return data as { pricing: Record<string, unknown> | null };
        },
        15000,
        "Sparningen tog för lång tid. Försök igen.",
      );
    },
    retry: false,
    onMutate: async (patch) => {
      console.debug("[pricing-save] onMutate start", {
        ts: Date.now(),
        leadId,
      });
      await qc.cancelQueries({ queryKey: key });
      console.debug("[pricing-save] cancelQueries done", {
        ts: Date.now(),
        leadId,
      });
      const prev = qc.getQueryData<CacheShape>(key);
      qc.setQueryData<CacheShape>(key, (cur) => {
        const base = cur?.pricing ?? {};
        return { pricing: { ...base, ...patch } };
      });
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(key, ctx.prev);
      console.debug("[pricing-save] onError", {
        ts: Date.now(),
        leadId,
        error: err,
      });
      console.error("[pricing-save] failed", err);
      if (isAuthError(err as never)) {
        toast.error(AUTH_EXPIRED_MESSAGE);
      } else {
        toast.error(err instanceof Error ? err.message : "Kunde inte spara — försök igen");
      }
    },
    onSuccess: (res, _vars, ctx) => {
      console.debug("[pricing-save] onSuccess", {
        ts: Date.now(),
        leadId,
      });
      if (res?.pricing) {
        // Behåll ev. updater-join från tidigare cache tills nästa naturliga
        // refetch fyller i den igen.
        const prevUpdater = (ctx?.prev?.pricing as Record<string, unknown> | undefined)?.updater;
        qc.setQueryData<CacheShape>(key, {
          pricing: { ...res.pricing, ...(prevUpdater ? { updater: prevUpdater } : {}) },
        });
      }
      toast.success("Sparat");
    },
    onSettled: () => {
      console.debug("[pricing-save] onSettled", {
        ts: Date.now(),
        leadId,
      });
    },
  });

  return {
    ...mutation,
    mutate: (patch: Patch, options?: Parameters<typeof mutation.mutate>[1]) => {
      console.debug("[pricing-save] clicked", {
        ts: Date.now(),
        leadId,
        patch,
      });
      mutation.mutate(patch, options);
    },
    mutateAsync: (patch: Patch, options?: Parameters<typeof mutation.mutateAsync>[1]) => {
      console.debug("[pricing-save] clicked", {
        ts: Date.now(),
        leadId,
        patch,
      });
      return mutation.mutateAsync(patch, options);
    },
  };
}
