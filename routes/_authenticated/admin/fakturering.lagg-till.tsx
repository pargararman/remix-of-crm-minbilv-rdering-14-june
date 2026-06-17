import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { addCustomBilling } from "@/lib/billing.functions";
import { listDealersLight } from "@/lib/sla-billing-settings.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/fakturering/lagg-till")({
  head: () => ({ meta: [{ title: "Ny rad — Fakturering" }] }),
  component: AddBillingPage,
});

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function AddBillingPage() {
  const nav = useNavigate();
  const dealersFn = useServerFn(listDealersLight);
  const addFn = useServerFn(addCustomBilling);
  const dealersQ = useQuery({ queryKey: ["dealers-light"], queryFn: () => dealersFn() });

  const [dealerId, setDealerId] = useState("");
  const [leadId, setLeadId] = useState("");
  const [amount, setAmount] = useState<number>(0);
  const [description, setDescription] = useState("");
  const [period, setPeriod] = useState(currentMonth());

  const mut = useMutation({
    mutationFn: () =>
      addFn({
        data: {
          dealer_id: dealerId,
          lead_id: leadId || undefined,
          amount,
          description,
          period,
        },
      }),
    onSuccess: () => {
      toast.success("Rad tillagd");
      nav({ to: "/admin/fakturering" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Misslyckades"),
  });

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Lägg till faktura­rad</h1>
        <p className="text-sm text-muted-foreground">
          Manuell post i fakturaunderlag — t.ex. korrigering eller engångsavgift.
        </p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Detaljer</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Handlare *</Label>
            <Select value={dealerId} onValueChange={setDealerId}>
              <SelectTrigger><SelectValue placeholder="Välj handlare…" /></SelectTrigger>
              <SelectContent>
                {(dealersQ.data?.dealers ?? []).map((d: any) => (
                  <SelectItem key={d.id} value={d.id}>{d.company_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Period *</Label>
            <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
          </div>
          <div>
            <Label>Belopp (kr) *</Label>
            <Input
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </div>
          <div>
            <Label>Lead ID (valfritt)</Label>
            <Input value={leadId} onChange={(e) => setLeadId(e.target.value)} placeholder="UUID" />
          </div>
          <div>
            <Label>Beskrivning *</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="T.ex. Justering, engångsavgift, etc."
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => nav({ to: "/admin/fakturering" })}>
              Avbryt
            </Button>
            <Button
              onClick={() => mut.mutate()}
              disabled={!dealerId || !description || !period || mut.isPending}
            >
              Spara rad
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
