//
// THE single save path for the lead valuation cards. Both QuickValuationPanel
// and CompactAssessmentPanel must use this hook so there is exactly one way to
// save vehicle/pricing data and one spinner state — no React Query mutation,
// no second SaveBar with its own isPending.
//
// Guarantees: local isSaving, hard 15s wall-clock timeout via Promise.race,
// finally always resets isSaving. The spinner can never run forever regardless
// of what Supabase/auth does.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { saveLeadValuation, isAuthLikeError } from "@/lib/save-lead-valuation";

const SAVE_TIMEOUT_MS = 15000;
const AUTH_EXPIRED_MESSAGE = "Sessionen har gått ut. Ladda om sidan eller logga in igen.";
const TIMEOUT_MESSAGE = "Sparningen tog för lång tid. Försök igen.";
const GENERIC_MESSAGE = "Kunde inte spara. Försök igen.";

export function useBoringSave(leadId: string) {
  const qc = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);

  /**
   * Saves the given patches. Returns true on success so the caller can clear
   * exactly the keys it snapshotted. Caller should snapshot its patch BEFORE
   * calling (so edits made during the save are preserved).
   */
  const save = async (
    vehiclePatch?: Record<string, unknown>,
    pricingPatch?: Record<string, unknown>,
  ): Promise<boolean> => {
    if (isSaving) return false;

    const hasV = !!vehiclePatch && Object.keys(vehiclePatch).length > 0;
    const hasP = !!pricingPatch && Object.keys(pricingPatch).length > 0;
    if (!hasV && !hasP) return false;

    console.debug("[lead-valuation-save] click", { ts: Date.now(), leadId, hasV, hasP });
    setIsSaving(true);

    const controller = new AbortController();
    let timeoutId: number | undefined;

    try {
      const result = await Promise.race([
        saveLeadValuation({
          leadId,
          vehiclePatch: hasV ? vehiclePatch : undefined,
          pricingPatch: hasP ? pricingPatch : undefined,
          signal: controller.signal,
        }),
        new Promise<never>((_, reject) => {
          timeoutId = window.setTimeout(() => {
            controller.abort();
            reject(new Error("SAVE_TIMEOUT"));
          }, SAVE_TIMEOUT_MS);
        }),
      ]);

      console.debug("[lead-valuation-save] success", { ts: Date.now(), leadId });
      if (hasV && result.vehicle) qc.setQueryData(["vehicle", leadId], { vehicle: result.vehicle });
      if (hasP && result.pricing) qc.setQueryData(["pricing", leadId], { pricing: result.pricing });
      if (result.vehicle || result.pricing) {
        qc.setQueryData(["lead-detail", leadId], (cur: unknown) => {
          if (!cur || typeof cur !== "object") return cur;
          return {
            ...(cur as Record<string, unknown>),
            ...(result.vehicle ? { vehicle: result.vehicle } : {}),
            ...(result.pricing ? { pricing: result.pricing } : {}),
          };
        });
      }
      toast.success("Sparat");
      return true;
    } catch (err) {
      console.error("[lead-valuation-save] error", { ts: Date.now(), leadId, err });
      const isTimeout =
        (err instanceof Error && err.message === "SAVE_TIMEOUT") || controller.signal.aborted;
      if (isTimeout) toast.error(TIMEOUT_MESSAGE);
      else if (isAuthLikeError(err as never)) toast.error(AUTH_EXPIRED_MESSAGE);
      else toast.error(GENERIC_MESSAGE);
      return false;
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
      console.debug("[lead-valuation-save] finally", { ts: Date.now(), leadId });
      setIsSaving(false);
    }
  };

  return { isSaving, save };
}
