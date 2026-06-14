//
// Snabb-värderings-panel: ÄGER save-flödet för fordon + pris via den enda
// gemensamma save-hooken (useBoringSave). Lokal isSaving, en synlig SaveBar.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Send } from "lucide-react";
import { ExternalButtons } from "./external-buttons";
import { BlocketValuationResult } from "./blocket-valuation-result";
import { PricingPanel } from "./pricing-panel";
import { BrandCombobox } from "./brand-combobox";
import { ModelCombobox } from "./model-combobox";
import { CommitTextField, CommitNumberField } from "./commit-inputs";
import { getVehicle } from "@/lib/vehicle.functions";
import { getPricing } from "@/lib/pricing.functions";
import { valuateBlocket } from "@/lib/valuation.functions";
import type { ValuationResult } from "@/lib/valuation/types";
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

  // Blocket-API-värdering (server-side). Knappen "Blocket" triggar denna.
  const runValuateBlocket = useServerFn(valuateBlocket);
  const blocket = useMutation({
    mutationFn: () => runValuateBlocket({ data: { leadId } }) as Promise<ValuationResult>,
    onError: () => toast.error("Kunde inte hämta Blocket-värdering."),
  });

  // "Använd i prissättning": skriv Blocket-spannet till pris-patchen.
  // Marknad (utannonserat) -> Utpris, est. marknadspris (-5%) -> Inpris (kund-SMS).
  const applyBlocket = (r: ValuationResult) => {
    if (!r.ok) return;
    setPricingPatch((p) => ({
      ...p,
      valuation_from: r.offerMedian,
      valuation_to: r.marketMedian,
      out_price_from: r.marketLow,
      out_price_to: r.marketHigh,
    }));
    toast.success("Blocket-värdering infört i prissättningen – kom ihåg att spara.");
  };

  const serverVehicle = (vq.data?.vehicle ?? null) as Vehicle | null;
  const serverPricing = (pq.data?.pricing ?? null) as (Record<string, unknown> & { updated_at?: string | null }) | null;

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

  const handleSave = async () => {
    // Snapshot BEFORE saving so edits made during the save survive.
    const vSnap = { ...vehiclePatch };
    const pSnap = { ...pricingPatch };
    const ok = await save(
      Object.keys(vSnap).length > 0 ? vSnap : undefined,
      Object.keys(pSnap).length > 0 ? pSnap : undefined,
    );
    if (!ok) return;
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
  };

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
            onBlocketValuate={() => blocket.mutate()}
            blocketPending={blocket.isPending}
          />
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

        {(blocket.isPending || blocket.data) && (
          <BlocketValuationResult
            result={(blocket.data as ValuationResult) ?? null}
            isPending={blocket.isPending}
            isError={blocket.isError}
            regnr={regnr}
            onApply={applyBlocket}
            onRetry={() => blocket.mutate()}
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
