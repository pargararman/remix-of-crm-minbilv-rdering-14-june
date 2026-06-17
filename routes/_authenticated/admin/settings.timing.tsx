import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { getCompanySettings, updateTimingSettings } from "@/lib/settings.functions";

export const Route = createFileRoute("/_authenticated/admin/settings/timing")({
  head: () => ({ meta: [{ title: "Tider — Admin" }] }),
  component: TimingPage,
});

function TimingPage() {
  const fetchFn = useServerFn(getCompanySettings);
  const updateFn = useServerFn(updateTimingSettings);
  const q = useQuery({ queryKey: ["company-settings"], queryFn: () => fetchFn() });
  const [state, setState] = useState<any>(null);

  useEffect(() => {
    if (q.data?.settings) setState(q.data.settings);
  }, [q.data]);

  if (!state) return <p className="text-muted-foreground">Laddar…</p>;

  async function save() {
    try {
      await updateFn({
        data: {
          id: state.id,
          followup_1_hours: Number(state.followup_1_hours),
          followup_2_hours: Number(state.followup_2_hours),
          followup_3_hours: Number(state.followup_3_hours),
          inget_svar_hours: Number(state.inget_svar_hours),
          auto_archive_days: Number(state.auto_archive_days),
          sms_quiet_hours_start: state.sms_quiet_hours_start,
          sms_quiet_hours_end: state.sms_quiet_hours_end,
        },
      });
      toast.success("Sparat");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte spara");
    }
  }

  function bind(k: string) {
    return {
      value: state[k] ?? "",
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setState({ ...state, [k]: e.target.value }),
    };
  }

  return (
    <div className="space-y-4 max-w-xl">
      <h1 className="text-xl font-semibold">Tider och tystnad-timmar</h1>
      <Card>
        <CardContent className="p-5 space-y-4">
          <Field label="Uppföljning 1 (timmar)">
            <Input type="number" min={1} {...bind("followup_1_hours")} />
          </Field>
          <Field label="Uppföljning 2 (timmar)">
            <Input type="number" min={1} {...bind("followup_2_hours")} />
          </Field>
          <Field label="Uppföljning 3 (timmar)">
            <Input type="number" min={1} {...bind("followup_3_hours")} />
          </Field>
          <Field label="Inget svar (timmar)">
            <Input type="number" min={1} {...bind("inget_svar_hours")} />
          </Field>
          <Field label="Auto-arkivering (dagar)">
            <Input type="number" min={1} {...bind("auto_archive_days")} />
          </Field>
          <Field label="Tystnad-timme börjar">
            <Input type="time" {...bind("sms_quiet_hours_start")} />
          </Field>
          <Field label="Tystnad-timme slutar">
            <Input type="time" {...bind("sms_quiet_hours_end")} />
          </Field>
          <Button onClick={save}>Spara</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 items-center gap-3">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
