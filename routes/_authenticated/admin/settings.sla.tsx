import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCompanySettings } from "@/lib/settings.functions";
import { updateSlaTargets } from "@/lib/sla-billing-settings.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/settings/sla")({
  head: () => ({ meta: [{ title: "SLA-mål — Inställningar" }] }),
  component: SlaSettingsPage,
});

const FIELDS: { key: string; label: string; unit: string; max: number }[] = [
  { key: "first_auto_sms_min", label: "Första auto-SMS", unit: "min", max: 1440 },
  { key: "first_manual_touch_min", label: "Första manuella kontakt", unit: "min", max: 1440 },
  { key: "first_valuation_min", label: "Första värdering", unit: "min", max: 10000 },
  { key: "first_bid_hours", label: "Första bud (handlare)", unit: "h", max: 720 },
  { key: "customer_accepted_hours", label: "Kund accepterar", unit: "h", max: 720 },
  { key: "pickup_hours", label: "Hämtning", unit: "h", max: 2400 },
];

function SlaSettingsPage() {
  const getFn = useServerFn(getCompanySettings);
  const updFn = useServerFn(updateSlaTargets);
  const q = useQuery({ queryKey: ["settings"], queryFn: () => getFn() });
  const [values, setValues] = useState<Record<string, number>>({});
  const [id, setId] = useState<string>("");

  useEffect(() => {
    const s = (q.data as any)?.settings;
    if (s) {
      setId(s.id);
      setValues({ ...s.sla_targets });
    }
  }, [q.data]);

  const mut = useMutation({
    mutationFn: () => updFn({ data: { id, ...values } as any }),
    onSuccess: () => toast.success("SLA-mål sparade"),
    onError: (e: any) => toast.error(e?.message ?? "Fel"),
  });

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">SLA-mål</h1>
        <p className="text-sm text-muted-foreground">
          Tidsmål per steg som mäts i rapporter.
        </p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Mål per moment</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {FIELDS.map((f) => (
            <div key={f.key} className="grid grid-cols-2 gap-3 items-center">
              <Label>{f.label}</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={f.max}
                  value={values[f.key] ?? ""}
                  onChange={(e) =>
                    setValues({ ...values, [f.key]: Number(e.target.value) })
                  }
                />
                <span className="text-sm text-muted-foreground w-8">{f.unit}</span>
              </div>
            </div>
          ))}
          <div className="flex justify-end pt-2">
            <Button onClick={() => mut.mutate()} disabled={!id || mut.isPending}>
              Spara
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
