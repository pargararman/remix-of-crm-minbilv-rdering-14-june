//
// Kompakt bedömningspanel. Använder NU samma "boring save" (useBoringSave) som
// QuickValuationPanel — ingen egen React Query-mutation, ingen mutation.isPending,
// ingen getUser. Delar cache ["vehicle", leadId].
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { CommitTextField } from "./commit-inputs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { getVehicle } from "@/lib/vehicle.functions";
import { SaveBar } from "./save-bar";
import { useBoringSave } from "@/hooks/use-boring-save";

type V = Record<string, unknown> & { updated_at?: string | null };

interface Props {
  leadId: string;
  onShowFull?: () => void;
}

export function CompactAssessmentPanel({ leadId, onShowFull }: Props) {
  const fetchFn = useServerFn(getVehicle);
  const q = useQuery({
    queryKey: ["vehicle", leadId],
    queryFn: () => fetchFn({ data: { leadId } }),
  });

  const [patch, setPatch] = useState<Record<string, unknown>>({});
  const { isSaving, save } = useBoringSave(leadId);
  const [showMore, setShowMore] = useState(false);

  const server = (q.data?.vehicle ?? {}) as V;
  const value = (k: string) => (k in patch ? patch[k] : server[k]) ?? null;
  const onChange = (k: string, v: unknown) => setPatch((p) => ({ ...p, [k]: v }));
  const isDirty = Object.keys(patch).length > 0;
  const lastSavedAt = server.updated_at ? new Date(server.updated_at).getTime() : null;

  const handleSave = async () => {
    const snapshot = { ...patch };
    if (Object.keys(snapshot).length === 0) return;
    const ok = await save(snapshot, undefined);
    if (!ok) return;
    setPatch((cur) => {
      const next = { ...cur };
      for (const k of Object.keys(snapshot)) delete next[k];
      return next;
    });
  };

  return (
    <Card>
      <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-sm">Bilens bedömning</CardTitle>
        <div className="flex items-center gap-2">
          {onShowFull && (
            <Button size="sm" variant="ghost" onClick={onShowFull} className="h-7 px-2 text-xs">
              Visa full bedömning
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-4">
        <SaveBar
          isDirty={isDirty}
          isSaving={isSaving}
          lastSavedAt={lastSavedAt}
          onSave={handleSave}
        />

        <Section title="Skick">
          <SelectField label="Skick" value={value("condition") as string} options={["Mycket bra", "Bra", "Normalt", "Dåligt", "Okänt"]} onChange={(v) => onChange("condition", v)} />
          <SelectField label="Servicebok" value={value("service_book") as string} options={["Fullständig", "Delvis", "Saknas", "Digital", "Okänt"]} onChange={(v) => onChange("service_book", v)} />
        </Section>

        <Section title="Nycklar och däck">
          <SelectField label="Antal nycklar" value={value("keys_count") as string} options={["1", "2", "Fler", "Okänt"]} onChange={(v) => onChange("keys_count", v)} />
          <SelectField label="Däck" value={value("tires") as string} options={["Sommardäck", "Vinterdäck", "Båda", "Saknas", "Okänt"]} onChange={(v) => onChange("tires", v)} />
        </Section>

        <Section title="Skador">
          <TextareaField className="sm:col-span-2" label="Skador / repor" value={value("damage_notes") as string} onChange={(v) => onChange("damage_notes", v)} />
        </Section>

        <Collapsible open={showMore} onOpenChange={setShowMore}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between h-8 text-xs">
              {showMore ? "Dölj bedömningsfält" : "Visa fler bedömningsfält"}
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showMore ? "rotate-180" : ""}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-2">
            <Section title="Skick — detaljer">
              <TextField label="Lackskick" value={value("paint_condition") as string} onChange={(v) => onChange("paint_condition", v)} />
              <TextField label="Interiörskick" value={value("interior_condition") as string} onChange={(v) => onChange("interior_condition", v)} />
              <YesNoField label="Rökfri" value={value("smoke_free") as boolean | null} onChange={(v) => onChange("smoke_free", v)} />
            </Section>

            <Section title="Däck — kommentar">
              <TextareaField className="sm:col-span-2" label="Sommardäck — kommentar" value={value("summer_tires_notes") as string} onChange={(v) => onChange("summer_tires_notes", v)} />
              <TextareaField className="sm:col-span-2" label="Vinterdäck — kommentar" value={value("winter_tires_notes") as string} onChange={(v) => onChange("winter_tires_notes", v)} />
            </Section>

            <Section title="Service">
              <DateField label="Senaste service" value={value("last_service_date") as string} onChange={(v) => onChange("last_service_date", v)} />
              <TextareaField className="sm:col-span-2" label="Senaste service — kommentar" value={value("last_service_notes") as string} onChange={(v) => onChange("last_service_notes", v)} />
            </Section>

            <Section title="Övrigt">
              <YesNoField label="Varningslampor" value={value("warning_lights") as boolean | null} onChange={(v) => onChange("warning_lights", v)} />
              <DateField label="Besiktning t.o.m." value={value("inspection_until") as string} onChange={(v) => onChange("inspection_until", v)} />
              <TextareaField className="sm:col-span-2" label="Motor / växellåda — kommentar" value={value("engine_gearbox_notes") as string} onChange={(v) => onChange("engine_gearbox_notes", v)} />
              <TextareaField className="sm:col-span-2" label="Extra utrustning" value={value("extra_equipment") as string} onChange={(v) => onChange("extra_equipment", v)} />
            </Section>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">{title}</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2">{children}</div>
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string | null | undefined; onChange: (v: string | null) => void }) {
  return <CommitTextField label={label} value={value} onCommit={onChange} />;
}

function TextareaField({ label, value, onChange, className }: { label: string; value: string | null | undefined; onChange: (v: string | null) => void; className?: string }) {
  return (
    <CommitTextField
      label={label}
      value={value}
      onCommit={onChange}
      multiline
      rows={2}
      className={className}
      inputClassName="min-h-[60px] max-h-24 resize-none"
    />
  );
}

function DateField({ label, value, onChange }: { label: string; value: string | null | undefined; onChange: (v: string | null) => void }) {
  return <CommitTextField label={label} value={value} onCommit={onChange} type="date" />;
}

function SelectField({ label, value, options, onChange }: { label: string; value: string | null | undefined; options: string[]; onChange: (v: string | null) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value ?? ""} onValueChange={(v) => onChange(v || null)}>
        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function YesNoField({ label, value, onChange }: { label: string; value: boolean | null | undefined; onChange: (v: boolean | null) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-1.5">
        {[
          { l: "Ja", v: true },
          { l: "Nej", v: false },
          { l: "Okänt", v: null },
        ].map((o) => (
          <button
            key={o.l}
            type="button"
            onClick={() => onChange(o.v)}
            className={`text-xs px-2.5 py-1 rounded border ${value === o.v ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border"}`}
          >
            {o.l}
          </button>
        ))}
      </div>
    </div>
  );
}
