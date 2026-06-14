// Full vehicle assessment form. ["vehicle", leadId] är källan till sanning.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CommitTextField } from "./commit-inputs";
import { getVehicle } from "@/lib/vehicle.functions";
import { useVehicleMutation } from "@/hooks/use-vehicle-mutation";
import { SaveBar } from "./save-bar";

type V = Record<string, unknown> & { updated_at?: string | null };

export function VehicleAssessment({ leadId }: { leadId: string }) {
  const fetchFn = useServerFn(getVehicle);
  const q = useQuery({
    queryKey: ["vehicle", leadId],
    queryFn: () => fetchFn({ data: { leadId } }),
  });

  const [patch, setPatch] = useState<Record<string, unknown>>({});
  const mutation = useVehicleMutation(leadId);

  if (q.isLoading) return <p className="text-muted-foreground text-sm">Laddar…</p>;

  const server = (q.data?.vehicle ?? {}) as V;
  const value = (k: string) => (k in patch ? patch[k] : server[k]) ?? null;
  const onChange = (k: string, v: unknown) => setPatch((p) => ({ ...p, [k]: v }));
  const isDirty = Object.keys(patch).length > 0;
  const lastSavedAt = server.updated_at ? new Date(server.updated_at).getTime() : null;

  return (
    <div className="space-y-4">
      <SaveBar
        isDirty={isDirty}
        isSaving={mutation.isPending}
        lastSavedAt={lastSavedAt}
        onSave={() => {
          const snapshot = { ...patch };
          mutation.mutate(snapshot, {
            onSuccess: () => {
              setPatch((current) => {
                const next = { ...current };
                for (const key of Object.keys(snapshot)) {
                  delete next[key];
                }
                return next;
              });
            },
          });
        }}
      />
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Bilens bedömning</h3>
      </div>

      <Section title="Bilens skick">
        <SelectField label="Skick" value={value("condition") as string} options={["Mycket bra","Bra","Normalt","Dåligt","Okänt"]} onChange={(val) => onChange("condition", val)} />
        <TextField label="Lackskick" value={value("paint_condition") as string} onChange={(val) => onChange("paint_condition", val)} />
        <TextField label="Interiörskick" value={value("interior_condition") as string} onChange={(val) => onChange("interior_condition", val)} />
        <RadioYesNo label="Rökfri" value={value("smoke_free") as boolean | null} onChange={(val) => onChange("smoke_free", val)} />
      </Section>

      <Section title="Nycklar och däck">
        <SelectField label="Antal nycklar" value={value("keys_count") as string} options={["1","2","Fler","Okänt"]} onChange={(val) => onChange("keys_count", val)} />
        <SelectField label="Däck" value={value("tires") as string} options={["Sommardäck","Vinterdäck","Båda","Saknas","Okänt"]} onChange={(val) => onChange("tires", val)} />
        <TextareaField label="Sommardäck — kommentar" value={value("summer_tires_notes") as string} onChange={(val) => onChange("summer_tires_notes", val)} />
        <TextareaField label="Vinterdäck — kommentar" value={value("winter_tires_notes") as string} onChange={(val) => onChange("winter_tires_notes", val)} />
      </Section>

      <Section title="Servicehistorik">
        <SelectField label="Servicebok" value={value("service_book") as string} options={["Fullständig","Delvis","Saknas","Digital","Okänt"]} onChange={(val) => onChange("service_book", val)} />
        <DateField label="Senaste service" value={value("last_service_date") as string} onChange={(val) => onChange("last_service_date", val)} />
        <TextareaField label="Senaste service — kommentar" value={value("last_service_notes") as string} onChange={(val) => onChange("last_service_notes", val)} />
        <TextareaField label="Kamrem / serviceinfo" value={value("timing_belt_notes") as string} onChange={(val) => onChange("timing_belt_notes", val)} />
      </Section>

      <Section title="Skador och varningar">
        <RadioYesNo label="Varningslampor" value={value("warning_lights") as boolean | null} onChange={(val) => onChange("warning_lights", val)} />
        <TextareaField label="Skador / repor" value={value("damage_notes") as string} onChange={(val) => onChange("damage_notes", val)} />
        <TextareaField label="Motor / växellåda" value={value("engine_gearbox_notes") as string} onChange={(val) => onChange("engine_gearbox_notes", val)} />
        <DateField label="Besiktning t.o.m." value={value("inspection_until") as string} onChange={(val) => onChange("inspection_until", val)} />
      </Section>

      <Section title="Utrustning">
        <TextareaField label="Extra utrustning" value={value("extra_equipment") as string} onChange={(val) => onChange("extra_equipment", val)} />
      </Section>

      <Section title="Kund">
        <SelectField label="Kundens brådska" value={value("urgency") as string} options={["Akut","Snart","Inom månaden","Ingen brådska"]} valueMap={{ "Akut": "akut", "Snart": "snart", "Inom månaden": "inom_manaden", "Ingen brådska": "ingen_bradska" }} onChange={(val) => onChange("urgency", val)} />
        <TextareaField label="Handlarfeedback (intern)" value={value("dealer_feedback") as string} onChange={(val) => onChange("dealer_feedback", val)} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">{children}</CardContent>
    </Card>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string | null) => void }) {
  return <CommitTextField label={label} value={value} onCommit={onChange} />;
}

function TextareaField({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string | null) => void }) {
  return (
    <CommitTextField
      label={label}
      value={value}
      onCommit={onChange}
      multiline
      rows={2}
      className="sm:col-span-2"
    />
  );
}

function DateField({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string | null) => void }) {
  return <CommitTextField label={label} value={value} onCommit={onChange} type="date" />;
}

function SelectField({ label, value, options, valueMap, onChange }: { label: string; value: string | null; options: string[]; valueMap?: Record<string,string>; onChange: (v: string | null) => void }) {
  const labelToValue = valueMap ?? Object.fromEntries(options.map((o) => [o, o]));
  const valueToLabel = Object.fromEntries(Object.entries(labelToValue).map(([k, v]) => [v, k]));
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value ?? ""} onValueChange={(v) => onChange((labelToValue[valueToLabel[v] ?? v] ?? v) || null)}>
        <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={labelToValue[o]}>{o}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function RadioYesNo({ label, value, onChange }: { label: string; value: boolean | null; onChange: (v: boolean | null) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2">
        {[
          { l: "Ja", v: true },
          { l: "Nej", v: false },
          { l: "Okänt", v: null },
        ].map((o) => (
          <button
            key={o.l}
            type="button"
            onClick={() => onChange(o.v)}
            className={`text-xs px-3 py-1 rounded border ${value === o.v ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border"}`}
          >
            {o.l}
          </button>
        ))}
      </div>
    </div>
  );
}
