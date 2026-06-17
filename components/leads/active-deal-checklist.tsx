// Aktiv affär — frikopplad checklista. Påverkar inte stage.
// Visas alltid i "Aktiv affär". I andra stages visas den endast om den
// redan har minst ett sparat värde (collapsed default).
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Check, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { getActiveDealChecklist, saveActiveDealChecklist } from "@/lib/leads-detail.functions";

const STEPS: { key: keyof Values; label: string }[] = [
  { key: "bud_mottaget", label: "Bud mottaget" },
  { key: "kund_kontaktad", label: "Kund kontaktad om bud" },
  { key: "bud_accepterat", label: "Bud accepterat" },
  { key: "hamtning_bokad", label: "Hämtning bokad" },
  { key: "hamtning_genomford", label: "Hämtning genomförd" },
];

type Values = {
  bud_mottaget: boolean;
  kund_kontaktad: boolean;
  bud_accepterat: boolean;
  hamtning_bokad: boolean;
  hamtning_genomford: boolean;
};

const EMPTY: Values = {
  bud_mottaget: false,
  kund_kontaktad: false,
  bud_accepterat: false,
  hamtning_bokad: false,
  hamtning_genomford: false,
};

interface Props {
  leadId: string;
  /** True när lead är i "Aktiv affär". Påverkar om kortet visas i tomt läge. */
  isActiveDeal?: boolean;
  /** Öppna automatiskt vid mount. Default: false. */
  defaultOpen?: boolean;
}

export function ActiveDealChecklist({ leadId, isActiveDeal = false, defaultOpen = false }: Props) {
  const getFn = useServerFn(getActiveDealChecklist);
  const saveFn = useServerFn(saveActiveDealChecklist);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["active-deal-checklist", leadId],
    queryFn: () => getFn({ data: { leadId } }),
    staleTime: 30_000,
  });

  const [values, setValues] = useState<Values>(EMPTY);
  const [serverValues, setServerValues] = useState<Values>(EMPTY);
  const [open, setOpen] = useState(defaultOpen);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (q.data) {
      const v: Values = {
        bud_mottaget: !!(q.data as any).bud_mottaget,
        kund_kontaktad: !!(q.data as any).kund_kontaktad,
        bud_accepterat: !!(q.data as any).bud_accepterat,
        hamtning_bokad: !!(q.data as any).hamtning_bokad,
        hamtning_genomford: !!(q.data as any).hamtning_genomford,
      };
      setValues(v);
      setServerValues(v);
    }
  }, [q.data]);

  const done = Object.values(values).filter(Boolean).length;
  const hasAny = Object.values(serverValues).some(Boolean);
  const isDirty = STEPS.some((s) => values[s.key] !== serverValues[s.key]);

  // Dölj helt om inte aktiv affär OCH inga sparade värden.
  if (!isActiveDeal && !hasAny && !q.isLoading) return null;

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      await saveFn({ data: { leadId, values } });
      setServerValues(values);
      setSavedAt(Date.now());
      qc.invalidateQueries({ queryKey: ["active-deal-checklist", leadId] });
      qc.invalidateQueries({ queryKey: ["timeline", leadId] });
      toast.success("Affärschecklista sparad");
    } catch (e: any) {
      const msg = e?.message ?? "Kunde inte spara";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-2 text-sm font-semibold"
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Affärschecklista
            <span className="text-xs font-normal text-muted-foreground">({done} / {STEPS.length} klara)</span>
          </button>
          <div className="flex items-center gap-2 text-xs">
            {error ? (
              <span className="text-destructive inline-flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" /> Kunde inte spara
              </span>
            ) : saving ? (
              <span className="text-muted-foreground inline-flex items-center gap-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Sparar…
              </span>
            ) : isDirty ? (
              <span className="text-status-followup font-medium">Osparade ändringar</span>
            ) : savedAt ? (
              <span className="text-status-completed inline-flex items-center gap-1">
                <Check className="h-3.5 w-3.5" /> Sparat
              </span>
            ) : null}
            <Button size="sm" onClick={onSave} disabled={!isDirty || saving}>
              Spara
            </Button>
          </div>
        </div>
        {open && (
          <div className="mt-3 space-y-2">
            {STEPS.map((s) => (
              <label key={s.key} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={values[s.key]}
                  onCheckedChange={(v) => setValues((prev) => ({ ...prev, [s.key]: !!v }))}
                />
                <span className={values[s.key] ? "line-through text-muted-foreground" : ""}>{s.label}</span>
              </label>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
