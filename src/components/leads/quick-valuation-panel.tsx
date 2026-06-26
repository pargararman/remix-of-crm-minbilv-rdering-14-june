//
// Snabb-värderings-panel: ÄGER save-flödet för fordon + pris via den enda
// gemensamma save-hooken (useBoringSave). Lokal isSaving, en synlig SaveBar.
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, Send } from "lucide-react";
import { ExternalButtons } from "./external-buttons";
import { BlocketValuationResult } from "./blocket-valuation-result";
import { PricingPanel } from "./pricing-panel";
import { BrandCombobox } from "./brand-combobox";
import { ModelCombobox } from "./model-combobox";
import { CommitTextField, CommitNumberField } from "./commit-inputs";
import { getVehicle, syncVehicleFromBiluppgifter } from "@/lib/vehicle.functions";
import { getPricing } from "@/lib/pricing.functions";
import { valuateBlocket } from "@/lib/valuation.functions";
import type { ValuationResult } from "@/lib/valuation/types";
import {
  BLOCKET_INCOMPLETE_MESSAGE,
  blocketMissingFieldsText,
  blocketVehicleFingerprint,
  isVehicleCompleteForBlocket,
} from "@/lib/valuation/vehicle-validation";
import { FUEL_OPTIONS, BODY_TYPE_OPTIONS, GEARBOX_OPTIONS, DRIVE_OPTIONS } from "@/lib/vehicle-enums";
import { SaveBar } from "./save-bar";
import { useBoringSave } from "@/hooks/use-boring-save";

interface Vehicle {
  brand?: string | null;
  model?: string | null;
  version?: string | null;
  year?: number | null;
  mileage_mil?: number | null;
  fuel?: string | null;
  gearbox?: string | null;
  drive_type?: string | null;
  body_type?: string | null;
  horsepower?: number | null;
  extra_equipment?: string | null;
  updated_at?: string | null;
}

interface Props {
  leadId: string;
  regnr: string | null;
  vehicle: Vehicle | null;
  carInfoPattern?: string | null;
  blocketPattern?: string | null;
  biluppgifterPattern?: string | null;
  valuationFrom: number | null | undefined;
  valuationTo: number | null | undefined;
  onSendOffer: () => void;
}

export function QuickValuationPanel({
  leadId,
  regnr,
  carInfoPattern,
  blocketPattern,
  biluppgifterPattern,
  valuationFrom,
  valuationTo,
  onSendOffer,
}: Props) {
  const fetchVehicle = useServerFn(getVehicle);
  const fetchPricing = useServerFn(getPricing);
  const syncBiluppgifter = useServerFn(syncVehicleFromBiluppgifter);
  const queryClient = useQueryClient();
  const autoSyncAttempted = useRef<string | null>(null);

  const vq = useQuery({
    queryKey: ["vehicle", leadId],
    queryFn: () => fetchVehicle({ data: { leadId } }),
  });
  const pq = useQuery({
    queryKey: ["pricing", leadId],
    queryFn: () => fetchPricing({ data: { leadId } }),
  });

  const [vehiclePatch, setVehiclePatch] = useState<Record<string, unknown>>({});
  const [pricingPatch, setPricingPatch] = useState<Record<string, unknown>>({});
  const { isSaving, save } = useBoringSave(leadId);

  const runValuateBlocket = useServerFn(valuateBlocket);
  const [lastBlocketKey, setLastBlocketKey] = useState<string | null>(null);

  // "Använd i prissättning": skriv den faktiska kundvärderingen + förklaringen.
  // Kundvärdering = näst lägsta jämförbara pris - avdrag enligt marginaltabellen.
  const applyBlocket = (r: ValuationResult) => {
    if (!r.ok || !r.customerOffer) return;
    const o = r.customerOffer;
    setPricingPatch((p) => ({
      ...p,
      valuation_from: o.customerLow,
      valuation_to: o.customerHigh,
      in_price_from: o.customerLow,
      in_price_to: o.customerHigh,
      out_price_from: o.referencePrice,
      out_price_to: o.referencePrice,
      pricing_notes: o.explanationText,
    }));
    toast.success("Blocket-värdering införd – kom ihåg att spara.");
  };

  const serverVehicle = (vq.data?.vehicle ?? null) as Vehicle | null;
  const serverPricing = (pq.data?.pricing ?? null) as (Record<string, unknown> & { updated_at?: string | null }) | null;

  const syncVehicle = useMutation({
    mutationKey: ["biluppgifter-sync", leadId],
    mutationFn: () => syncBiluppgifter({ data: { leadId } }),
    onSuccess: async (res) => {
      if ((res?.changed ?? 0) > 0) {
        setVehiclePatch({});
        toast.success("Biluppgifter hämtade");
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["vehicle", leadId] }),
        queryClient.invalidateQueries({ queryKey: ["lead-detail", leadId] }),
      ]);
    },
    onError: (err: any) => {
      toast.error(err?.message ?? "Kunde inte hämta biluppgifter.");
    },
  });

  const value = <K extends keyof Vehicle>(k: K): Vehicle[K] | null | undefined =>
    (k in vehiclePatch ? (vehiclePatch[k as string] as Vehicle[K]) : serverVehicle?.[k]) ?? null;
  const onVehicleChange = (k: string, v: unknown) => setVehiclePatch((p) => ({ ...p, [k]: v }));

  const isDirty = Object.keys(vehiclePatch).length > 0 || Object.keys(pricingPatch).length > 0;
  const lastSavedAt = (() => {
    const v = serverVehicle?.updated_at ? new Date(serverVehicle.updated_at).getTime() : 0;
    const p = serverPricing?.updated_at ? new Date(serverPricing.updated_at as string).getTime() : 0;
    const m = Math.max(v, p);
    return m > 0 ? m : null;
  })();

  const canSendOffer = valuationFrom != null && valuationTo != null;
  const liveVehicle: Vehicle = { ...(serverVehicle ?? {}), ...vehiclePatch };
  const blocketComplete = isVehicleCompleteForBlocket(liveVehicle);
  const blocketMissingText = blocketMissingFieldsText(liveVehicle);
  const blocketKey = blocketVehicleFingerprint(liveVehicle);
  const blocketKeyString = JSON.stringify(blocketKey);
  const hasCoreVehicleInfo = !!(
    serverVehicle?.brand ||
    serverVehicle?.model ||
    serverVehicle?.version ||
    serverVehicle?.year ||
    serverVehicle?.fuel ||
    serverVehicle?.gearbox ||
    serverVehicle?.body_type ||
    serverVehicle?.drive_type ||
    serverVehicle?.horsepower
  );

  useEffect(() => {
    if (!regnr || vq.isLoading || vq.isFetching || isDirty || hasCoreVehicleInfo || syncVehicle.isPending) {
      return;
    }
    const attemptKey = `${leadId}:${regnr}`;
    if (autoSyncAttempted.current === attemptKey) return;
    autoSyncAttempted.current = attemptKey;
    syncVehicle.mutate();
  }, [
    leadId,
    regnr,
    vq.isLoading,
    vq.isFetching,
    isDirty,
    hasCoreVehicleInfo,
    syncVehicle.isPending,
  ]);

  // Blocket-API-värdering (server-side). Skippas helt tills obligatoriska fält är kompletta.
  const blocket = useMutation({
    mutationKey: ["blocket-valuation", leadId, ...blocketKey],
    mutationFn: () => runValuateBlocket({ data: { leadId } }) as Promise<ValuationResult>,
    onError: () => toast.error("Kunde inte hämta Blocket-värdering."),
  });

  const handleSave = async (): Promise<boolean> => {
    // Snapshot BEFORE saving so edits made during the save survive.
    const vSnap = { ...vehiclePatch };
    const pSnap = { ...pricingPatch };
    const ok = await save(
      Object.keys(vSnap).length > 0 ? vSnap : undefined,
      Object.keys(pSnap).length > 0 ? pSnap : undefined,
    );
    if (!ok) return false;
    setVehiclePatch((cur) => {
      const next = { ...cur };
      for (const k of Object.keys(vSnap)) delete next[k];
      return next;
    });
    setPricingPatch((cur) => {
      const next = { ...cur };
      for (const k of Object.keys(pSnap)) delete next[k];
      return next;
    });
    return true;
  };

  const handleBlocketValuate = async () => {
    if (!blocketComplete) {
      toast.info(blocketMissingText || BLOCKET_INCOMPLETE_MESSAGE);
      return;
    }
    // If vehicle edits are pending locally, persist them first so the server-side lookup
    // uses the same complete vehicle data the UI just validated.
    if (Object.keys(vehiclePatch).length > 0) {
      const ok = await handleSave();
      if (!ok) return;
    }
    setLastBlocketKey(blocketKeyString);
    blocket.mutate();
  };

  const showCurrentBlocketResult =
    blocket.isPending || (blocket.data && lastBlocketKey === blocketKeyString);

  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm">Snabb värdering</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-4">
        <SaveBar
          isDirty={isDirty}
          isSaving={isSaving}
          lastSavedAt={lastSavedAt}
          onSave={handleSave}
        />

        <div className="flex flex-wrap items-center gap-2">
          <ExternalButtons
            leadId={leadId}
            regnr={regnr}
            vehicle={liveVehicle}
            carInfoPattern={carInfoPattern}
            blocketPattern={blocketPattern}
            biluppgifterPattern={biluppgifterPattern}
            onBlocketValuate={handleBlocketValuate}
            blocketPending={blocket.isPending || isSaving}
          />
          {syncVehicle.isPending && (
            <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Hämtar biluppgifter
            </span>
          )}
          <div className="ml-auto">
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button size="sm" disabled={!canSendOffer} onClick={onSendOffer}>
                      <Send className="h-3.5 w-3.5 mr-1" />
                      Skicka SMS med värdering
                    </Button>
                  </span>
                </TooltipTrigger>
                {!canSendOffer && (
                  <TooltipContent>Fyll i värdering från och till först</TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {!blocketComplete && (
          <div className="rounded-md border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            <p className="font-medium">{BLOCKET_INCOMPLETE_MESSAGE}</p>
            <p className="mt-1">{blocketMissingText.replace(BLOCKET_INCOMPLETE_MESSAGE, "").trim()}</p>
          </div>
        )}

        {showCurrentBlocketResult && (
          <BlocketValuationResult
            result={(blocket.data as ValuationResult) ?? null}
            isPending={blocket.isPending}
            isError={blocket.isError}
            regnr={regnr}
            onApply={applyBlocket}
            onRetry={handleBlocketValuate}
          />
        )}

        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Biluppgifter</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2">
            <BrandCombobox value={value("brand") as string} onChange={(v) => onVehicleChange("brand", v)} />
            <ModelCombobox brand={value("brand") as string} value={value("model") as string} onChange={(v) => onVehicleChange("model", v)} />
            <CommitTextField label="Version / utförande" value={value("version") as string} onCommit={(v) => onVehicleChange("version", v)} />
            <CommitNumberField label="Årsmodell" value={value("year") as number | null} onCommit={(v) => onVehicleChange("year", v)} />
            <CommitNumberField label="Miltal (mil)" value={value("mileage_mil") as number | null} onCommit={(v) => onVehicleChange("mileage_mil", v)} />
            <SelectField label="Drivmedel" value={value("fuel") as string}
              options={FUEL_OPTIONS as any} onChange={(v) => onVehicleChange("fuel", v)} />
            <SelectField label="Karosstyp" value={value("body_type") as string}
              options={BODY_TYPE_OPTIONS as any} onChange={(v) => onVehicleChange("body_type", v)} />
            <SelectField label="Drivhjul" value={value("drive_type") as string}
              options={DRIVE_OPTIONS as any} onChange={(v) => onVehicleChange("drive_type", v)} />
            <SelectField label="Växellåda" value={value("gearbox") as string}
              options={GEARBOX_OPTIONS as any} onChange={(v) => onVehicleChange("gearbox", v)} />
            <CommitNumberField label="Hästkrafter" value={value("horsepower") as number | null} onCommit={(v) => onVehicleChange("horsepower", v)} />
            <CommitTextField label="Extra utrustning" value={value("extra_equipment") as string} onCommit={(v) => onVehicleChange("extra_equipment", v)} />
          </div>
        </section>

        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Prissättning</h4>
          <PricingPanel
            leadId={leadId}
            controlled
            patch={pricingPatch}
            onPatchChange={setPricingPatch}
            serverPricing={serverPricing}
            embedded
          />
        </section>
      </CardContent>
    </Card>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null | undefined;
  options: { value: string; label: string }[];
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value ?? ""} onValueChange={(v) => onChange(v || null)}>
        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
