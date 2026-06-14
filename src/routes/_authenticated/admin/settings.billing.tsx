import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCompanySettings } from "@/lib/settings.functions";
import { updateBillingSettings } from "@/lib/sla-billing-settings.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/settings/billing")({
  head: () => ({ meta: [{ title: "Fakturering — Inställningar" }] }),
  component: BillingSettingsPage,
});

function BillingSettingsPage() {
  const getFn = useServerFn(getCompanySettings);
  const updFn = useServerFn(updateBillingSettings);
  const q = useQuery({ queryKey: ["settings"], queryFn: () => getFn() });

  const [id, setId] = useState("");
  const [vat, setVat] = useState(25);
  const [addr, setAddr] = useState("");
  const [org, setOrg] = useState("");
  const [bank, setBank] = useState("");

  useEffect(() => {
    const s = (q.data as any)?.settings;
    if (s) {
      setId(s.id);
      setVat(s.vat_rate ?? 25);
      setAddr(s.company_address ?? "");
      setOrg(s.org_number ?? "");
      setBank(s.bank_details ?? "");
    }
  }, [q.data]);

  const mut = useMutation({
    mutationFn: () =>
      updFn({
        data: {
          id,
          vat_rate: vat,
          company_address: addr || null,
          org_number: org || null,
          bank_details: bank || null,
        },
      }),
    onSuccess: () => toast.success("Sparade"),
    onError: (e: any) => toast.error(e?.message ?? "Fel"),
  });

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Faktureringsinställningar</h1>
        <p className="text-sm text-muted-foreground">
          Företagsuppgifter som visas på fakturaunderlag.
        </p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Företag</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Moms (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={vat}
              onChange={(e) => setVat(Number(e.target.value))}
            />
          </div>
          <div>
            <Label>Org.nummer</Label>
            <Input value={org} onChange={(e) => setOrg(e.target.value)} />
          </div>
          <div>
            <Label>Företagsadress</Label>
            <Textarea value={addr} onChange={(e) => setAddr(e.target.value)} rows={3} />
          </div>
          <div>
            <Label>Bankuppgifter (BG/PG/IBAN)</Label>
            <Textarea value={bank} onChange={(e) => setBank(e.target.value)} rows={3} />
          </div>
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
