import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getLeadsReport, getSellerReport, getDealerReport,
  getSlaReport, getLostReport, getSourceReport,
} from "@/lib/reports.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/rapporter")({
  head: () => ({ meta: [{ title: "Rapporter — Min Bil Värdering" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  const today = new Date();
  const monthAgo = new Date(today.getTime() - 30 * 86400_000);
  const [from, setFrom] = useState(monthAgo.toISOString().substring(0, 10));
  const [to, setTo] = useState(today.toISOString().substring(0, 10));
  const range = { from: new Date(from).toISOString(), to: new Date(to + "T23:59:59").toISOString(), compare: false };

  const leadsFn = useServerFn(getLeadsReport);
  const sellerFn = useServerFn(getSellerReport);
  const dealerFn = useServerFn(getDealerReport);
  const slaFn = useServerFn(getSlaReport);
  const lostFn = useServerFn(getLostReport);
  const sourceFn = useServerFn(getSourceReport);

  const leads = useQuery({ queryKey: ["rep-leads", from, to], queryFn: () => leadsFn({ data: range }) });
  const sellers = useQuery({ queryKey: ["rep-sellers", from, to], queryFn: () => sellerFn({ data: range }) });
  const dealers = useQuery({ queryKey: ["rep-dealers", from, to], queryFn: () => dealerFn({ data: range }) });
  const sla = useQuery({ queryKey: ["rep-sla", from, to], queryFn: () => slaFn({ data: range }) });
  const lost = useQuery({ queryKey: ["rep-lost", from, to], queryFn: () => lostFn({ data: range }) });
  const sources = useQuery({ queryKey: ["rep-sources", from, to], queryFn: () => sourceFn({ data: range }) });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-end">
        <div><Label>Från</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><Label>Till</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </div>

      <Tabs defaultValue="leads">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="seller">Säljare</TabsTrigger>
          <TabsTrigger value="dealer">Handlare</TabsTrigger>
          <TabsTrigger value="sla">SLA</TabsTrigger>
          <TabsTrigger value="lost">Tappade</TabsTrigger>
          <TabsTrigger value="sources">Källor</TabsTrigger>
        </TabsList>

        <TabsContent value="leads">
          {leads.data && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
              <Kpi label="Totalt" value={leads.data.kpis.total} />
              <Kpi label="Aktiva" value={leads.data.kpis.active} />
              <Kpi label="Vunna" value={leads.data.kpis.won_count} />
              <Kpi label="Värde" value={`${leads.data.kpis.won_value.toLocaleString("sv-SE")} kr`} />
              <Kpi label="Konv. %" value={`${leads.data.kpis.conv_rate.toFixed(1)}%`} />
            </div>
          )}
          <div className="grid md:grid-cols-2 gap-4 mt-4">
            <SimpleBar title="Per källa" rows={leads.data?.by_source ?? []} />
            <SimpleBar title="Per steg" rows={leads.data?.by_stage ?? []} />
            <SimpleBar title="Top städer" rows={leads.data?.by_city ?? []} />
            <SimpleBar title="Top märken" rows={leads.data?.by_brand ?? []} />
          </div>
        </TabsContent>

        <TabsContent value="seller">
          <Table headers={["Säljare", "Tilldelade", "SMS", "Samtal", "Vunna", "Förlorade", "Konv. %"]}
            rows={(sellers.data?.rows ?? []).map((r: any) => [r.name, r.assigned, r.sms_sent, r.calls, r.won, r.lost, `${r.conv_rate.toFixed(1)}%`])} />
        </TabsContent>

        <TabsContent value="dealer">
          <Table headers={["Handlare", "Tilldelade", "Visade", "Bud", "Vunna", "Vinst-%", "Reliability", "Belopp"]}
            rows={(dealers.data?.rows ?? []).map((r: any) => [r.name, r.assigned, r.viewed, r.bids, r.won, `${r.win_rate.toFixed(1)}%`, r.reliability, `${r.billing_total.toLocaleString("sv-SE")} kr`])} />
        </TabsContent>

        <TabsContent value="sla">
          {sla.data && (
            <div className="space-y-2 mt-4">
              <SlaRow label="Första auto-SMS (min)" actual={sla.data.averages.first_auto_sms_min} target={sla.data.targets.first_auto_sms_min} />
              <SlaRow label="Första manuell kontakt (min)" actual={sla.data.averages.first_manual_touch_min} target={sla.data.targets.first_manual_touch_min} />
              <SlaRow label="Värdering (min)" actual={sla.data.averages.first_valuation_min} target={sla.data.targets.first_valuation_min} />
              <SlaRow label="Första handlarbud (h)" actual={sla.data.averages.first_bid_hours} target={sla.data.targets.first_bid_hours} />
              <SlaRow label="Kundacceptans (h)" actual={sla.data.averages.customer_accepted_hours} target={sla.data.targets.customer_accepted_hours} />
              <SlaRow label="Hämtning (h)" actual={sla.data.averages.pickup_hours} target={sla.data.targets.pickup_hours} />
              <SlaRow label="Försenade tasks" actual={sla.data.overdue_tasks} target={0} />
            </div>
          )}
        </TabsContent>

        <TabsContent value="lost">
          <Table headers={["Skäl", "Antal", "Tappat värde (kr)"]}
            rows={(lost.data?.reasons ?? []).map((r: any) => [r.key, r.count, r.value.toLocaleString("sv-SE")])} />
        </TabsContent>

        <TabsContent value="sources">
          <Table headers={["Källa", "Leads", "Vunna", "Konv. %", "Totalt värde", "Snitt/won", "Snitt/lead"]}
            rows={(sources.data?.sources ?? []).map((s: any) => [s.key, s.total, s.won, `${s.conv_rate.toFixed(1)}%`, `${s.total_value.toLocaleString("sv-SE")} kr`, `${Math.round(s.avg_per_won).toLocaleString("sv-SE")} kr`, `${Math.round(s.avg_per_lead).toLocaleString("sv-SE")} kr`])} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: any }) {
  return <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{label}</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{value}</CardContent></Card>;
}
function SimpleBar({ title, rows }: { title: string; rows: Array<{ key: string; count: number }> }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Card><CardHeader><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {rows.map((r) => (
          <div key={r.key} className="text-xs">
            <div className="flex justify-between"><span>{r.key}</span><span className="text-muted-foreground">{r.count}</span></div>
            <div className="h-1.5 bg-muted rounded"><div className="h-full bg-primary rounded" style={{ width: `${(r.count / max) * 100}%` }} /></div>
          </div>
        ))}
        {!rows.length && <p className="text-xs text-muted-foreground">Inga data</p>}
      </CardContent></Card>
  );
}
function Table({ headers, rows }: { headers: string[]; rows: any[][] }) {
  return (
    <div className="overflow-x-auto mt-4 border border-border rounded">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-border">{headers.map((h) => <th key={h} className="text-left p-2 font-medium">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-border/50">{r.map((c, j) => <td key={j} className="p-2">{c}</td>)}</tr>)}
        {!rows.length && <tr><td colSpan={headers.length} className="p-4 text-center text-muted-foreground">Inga data</td></tr>}</tbody>
      </table>
    </div>
  );
}
function SlaRow({ label, actual, target }: { label: string; actual: number | null; target: number }) {
  const ok = actual === null ? null : actual <= target;
  return (
    <div className="flex justify-between items-center p-3 border border-border rounded">
      <span>{label}</span>
      <div className="flex gap-3 items-center">
        <span className="text-sm text-muted-foreground">Mål {target}</span>
        <span className="font-semibold">{actual === null ? "—" : actual.toFixed(1)}</span>
        {ok !== null && <Badge variant={ok ? "default" : "destructive"}>{ok ? "✓" : "✗"}</Badge>}
      </div>
    </div>
  );
}
