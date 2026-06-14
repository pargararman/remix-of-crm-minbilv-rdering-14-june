// Manuell steg-väljare som visas i sticky toppbar på lead-detalj.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { updateLeadStage } from "@/lib/leads-detail.functions";
import type { LeadStage } from "@/lib/leads.functions";

// Manuell sekvens — speglar dashboard-grupperna men en konkret DB-stage per steg.
// OBS (ändrat 2026-06-12, Beslut A): stage `matchad` = "Godkänt pris".
// Publicering till handlare sker ENDAST via "Publicera till handlare"-
// dialogen där säljaren väljer vilka handlare som får se bilen.
// Auktionstiden (auction_closes_at) sätts fortfarande av DB-triggern när
// leadet når matchad. Övergångar valideras numera mot matrisen på servern.
const STAGE_SEQUENCE: { value: LeadStage; label: string; confirm?: boolean }[] = [
  { value: "ny_lead", label: "Behöver värderas" },
  { value: "kontaktad", label: "Kontakt 1" },
  { value: "uppfoljning_1", label: "Kontakt 2" },
  { value: "uppfoljning_2", label: "Kontakt 3" },
  { value: "inget_svar", label: "Inget svar" },
  { value: "matchad", label: "Godkänt pris (redo att publicera)" },
  { value: "kund_accepterat", label: "Aktiv affär" },
  { value: "vunnen", label: "Vunnen affär", confirm: true },
  { value: "forlorad", label: "Förlorad", confirm: true },
  { value: "arkiverad", label: "Arkiv", confirm: true },
];

// Mappa befintlig DB-stage till sekvensens närmaste motsvarighet.
function indexFor(stage: LeadStage, archived: boolean): number {
  if (archived) return STAGE_SEQUENCE.length - 1;
  const direct = STAGE_SEQUENCE.findIndex((s) => s.value === stage);
  if (direct >= 0) return direct;
  // Aliasar
  const alias: Partial<Record<LeadStage, LeadStage>> = {
    snabb_vardering: "ny_lead",
    uppfoljning_3: "uppfoljning_2",
    bud_mottaget: "kund_accepterat", // vinnare vald → visas som Aktiv affär
    kontrakt_pagar_avtal: "kund_accepterat",
    hamtning: "kund_accepterat",
  };
  const a = alias[stage];
  return a ? STAGE_SEQUENCE.findIndex((s) => s.value === a) : 0;
}

interface Props {
  leadId: string;
  currentStage: LeadStage;
  archived: boolean;
}

export function StagePicker({ leadId, currentStage, archived }: Props) {
  const updateFn = useServerFn(updateLeadStage);
  const qc = useQueryClient();
  const [pending, setPending] = useState<{ value: LeadStage; label: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const curIdx = indexFor(currentStage, archived);
  const currentValue = STAGE_SEQUENCE[curIdx]?.value ?? currentStage;
  const nextStep = STAGE_SEQUENCE[curIdx + 1];

  async function commit(target: LeadStage) {
    setSaving(true);
    try {
      await updateFn({ data: { leadId, stage: target } });
      toast.success("Steg uppdaterat");
      qc.invalidateQueries({ queryKey: ["lead-detail", leadId] });
      qc.invalidateQueries({ queryKey: ["stage-counts"] });
      qc.invalidateQueries({ queryKey: ["stage-group-counts"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Kunde inte uppdatera steg");
    } finally {
      setSaving(false);
      setPending(null);
    }
  }

  function onSelect(value: string) {
    const target = STAGE_SEQUENCE.find((s) => s.value === value);
    if (!target || target.value === currentValue) return;
    if (target.confirm) setPending(target);
    else void commit(target.value);
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground hidden sm:inline">Steg</span>
        <Select value={currentValue} onValueChange={onSelect} disabled={saving}>
          <SelectTrigger className="h-8 w-[200px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STAGE_SEQUENCE.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {nextStep && (
          <Button
            size="sm"
            variant="outline"
            disabled={saving}
            onClick={() => {
              if (nextStep.confirm) setPending(nextStep);
              else void commit(nextStep.value);
            }}
            title={`Flytta till "${nextStep.label}"`}
          >
            Nästa steg <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
          </Button>
        )}
      </div>

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Flytta lead till "{pending?.label}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Detta är en manuell stegförflyttning som loggas i tidslinjen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={() => pending && commit(pending.value)}>
              Bekräfta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
