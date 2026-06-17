import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listBillingLogs,
  billingSummary,
  markBillingInvoiced,
  generateInvoicePdf,
} from "@/lib/billing.functions";
import { listDealersLight } from "@/lib/sla-billing-settings.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Download, Plus, FileText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/fakturering")({
  head: () => ({ meta: [{ title: "Fakturering — Min Bil Värdering" }] }),
  component: BillingPage,
});

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatKr(n: number) {
  return `${(n ?? 0).toLocaleString("sv-SE")} kr`;
}

function BillingPage() {
  const [period, setPeriod] = useState(currentMonth());
  const [status, setStatus] = useState<string>("all");
  const [dealerFilter, setDealerFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const qc = useQueryClient();

  const listFn = useServerFn(listBillingLogs);
  const sumFn = useServerFn(billingSummary);
  const markFn = useServerFn(markBillingInvoiced);
  const pdfFn = useServerFn(generateInvoicePdf);
  const dealersFn = useServerFn(listDealersLight);

  const filter = {
    period,
    status: status === "all" ? undefined : (status as any),
    dealer_ids: dealerFilter === "all" ? undefined : [dealerFilter],
  };

  const rowsQ = useQuery({
    queryKey: ["billing-rows", period, status, dealerFilter],
    queryFn: () => listFn({ data: filter }),
  });
  const sumQ = useQuery({
    queryKey: ["billing-sum", period],
    queryFn: () => sumFn({ data: { period } }),
  });
  const dealersQ = useQuery({ queryKey: ["dealers-light"], queryFn: () => dealersFn() });

  const grouped = useMemo(() => {
    const rows = (rowsQ.data?.rows ?? []) as any[];
    const map = new Map<string, { dealer: any; rows: any[] }>();
    for (const r of rows) {
      const key = r.dealer_id;
      if (!map.has(key)) map.set(key, { dealer: r.dealer, rows: [] });
      map.get(key)!.rows.push(r);
    }
    return [...map.entries()].sort((a, b) =>
      (a[1].dealer?.company_name ?? "").localeCompare(b[1].dealer?.company_name ?? ""),
    );
  }, [rowsQ.data]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["billing-rows"] });
    qc.invalidateQueries({ queryKey: ["billing-sum"] });
  };

  const markMut = useMutation({
    mutationFn: (input: { ids: string[]; status: any; ref?: string }) =>
      markFn({
        data: { ids: input.ids, status: input.status, invoice_reference: input.ref },
      }),
    onSuccess: (r) => {
      toast.success(`${(r as any).count} rader uppdaterade`);
      setSelected(new Set());
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Misslyckades"),
  });

  const pdfMut = useMutation({
    mutationFn: (dealer_id: string) => pdfFn({ data: { dealer_id, period } }),
    onSuccess: (r) => {
      window.open((r as any).url, "_blank");
      toast.success("Underlag genererat");
    },
    onError: (e: any) => toast.error(e?.message ?? "PDF-fel"),
  });

  const toggle = (id: string) => {
    const n = new Set(selected);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelected(n);
  };

  const toggleAll = (rows: any[]) => {
    const ids = rows
      .filter((r) => r.invoice_status === "not_billed")
      .map((r) => r.id);
    const allSelected = ids.every((id) => selected.has(id));
    const n = new Set(selected);
    ids.forEach((id) => (allSelected ? n.delete(id) : n.add(id)));
    setSelected(n);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Fakturering</h1>
          <p className="text-sm text-muted-foreground">
            Översikt och hantering av handlarunderlag.
          </p>
        </div>
        <Link to="/admin/fakturering/lagg-till">
          <Button size="sm">
            <Plus className="h-4 w-4 mr-1" /> Lägg till rad
          </Button>
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <KPI label="Att fakturera" value={formatKr(sumQ.data?.total_to_invoice ?? 0)} />
        <KPI label="Fakturerat" value={formatKr(sumQ.data?.total_invoiced ?? 0)} />
        <KPI label="Betalt" value={formatKr(sumQ.data?.total_paid ?? 0)} />
        <KPI label="Handlare m. obet." value={String(sumQ.data?.dealer_count ?? 0)} />
      </div>

      <Card>
        <CardContent className="flex flex-wrap gap-3 items-end pt-6">
          <div>
            <Label className="text-xs">Period (YYYY-MM)</Label>
            <Input
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="w-40"
            />
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla</SelectItem>
                <SelectItem value="not_billed">Ej fakturerat</SelectItem>
                <SelectItem value="draft">Utkast</SelectItem>
                <SelectItem value="sent">Skickat</SelectItem>
                <SelectItem value="paid">Betalt</SelectItem>
                <SelectItem value="cancelled">Makulerat</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Handlare</Label>
            <Select value={dealerFilter} onValueChange={setDealerFilter}>
              <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla</SelectItem>
                {(dealersQ.data?.dealers ?? []).map((d: any) => (
                  <SelectItem key={d.id} value={d.id}>{d.company_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selected.size > 0 && (
            <div className="ml-auto flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  markMut.mutate({ ids: [...selected], status: "sent" })
                }
              >
                Markera {selected.size} som skickat
              </Button>
              <Button
                size="sm"
                onClick={() => markMut.mutate({ ids: [...selected], status: "paid" })}
              >
                Markera som betalt
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {rowsQ.isLoading && <p className="text-sm text-muted-foreground">Laddar…</p>}
      {!rowsQ.isLoading && grouped.length === 0 && (
        <p className="text-sm text-muted-foreground">Inga rader för valda filter.</p>
      )}

      <div className="space-y-4">
        {grouped.map(([dealerId, g]) => {
          const total = g.rows.reduce((s, r) => s + (r.amount ?? 0), 0);
          const unbilled = g.rows.filter((r) => r.invoice_status === "not_billed");
          return (
            <Card key={dealerId}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-base">
                    {g.dealer?.company_name ?? "Okänd"}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {g.rows.length} rader · {formatKr(total)} · {g.dealer?.pricing_model}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => pdfMut.mutate(dealerId)}
                    disabled={pdfMut.isPending}
                  >
                    <FileText className="h-3.5 w-3.5 mr-1" /> Skapa underlag
                  </Button>
                  {unbilled.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        markMut.mutate({
                          ids: unbilled.map((r) => r.id),
                          status: "sent",
                        })
                      }
                    >
                      Markera alla som skickat
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 w-8">
                        <Checkbox
                          checked={
                            unbilled.length > 0 &&
                            unbilled.every((r) => selected.has(r.id))
                          }
                          onCheckedChange={() => toggleAll(g.rows)}
                        />
                      </th>
                      <th className="px-3 py-2">Datum</th>
                      <th className="px-3 py-2">Beskrivning</th>
                      <th className="px-3 py-2">Typ</th>
                      <th className="px-3 py-2 text-right">Belopp</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Ref</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((r) => (
                      <tr key={r.id} className="border-b border-border/40">
                        <td className="px-3 py-2">
                          {r.invoice_status === "not_billed" && (
                            <Checkbox
                              checked={selected.has(r.id)}
                              onCheckedChange={() => toggle(r.id)}
                            />
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {new Date(r.created_at).toLocaleDateString("sv-SE")}
                        </td>
                        <td className="px-3 py-2">{r.description ?? r.event_type}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {r.event_type}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatKr(r.amount)}
                        </td>
                        <td className="px-3 py-2">
                          <StatusBadge status={r.invoice_status} />
                        </td>
                        <td className="px-3 py-2 text-muted-foreground text-xs">
                          {r.invoice_reference ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex gap-2 pt-2">
        <Button
          variant="outline"
          size="sm"
          disabled
          title="Fas 5.2"
        >
          <Download className="h-3.5 w-3.5 mr-1" /> Exportera Excel (Fas 5.2)
        </Button>
      </div>
    </div>
  );
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: any }> = {
    not_billed: { label: "Ej fakt.", variant: "secondary" },
    draft: { label: "Utkast", variant: "outline" },
    sent: { label: "Skickad", variant: "default" },
    paid: { label: "Betald", variant: "default" },
    cancelled: { label: "Makulerad", variant: "destructive" },
  };
  const m = map[status] ?? { label: status, variant: "secondary" };
  return <Badge variant={m.variant}>{m.label}</Badge>;
}
