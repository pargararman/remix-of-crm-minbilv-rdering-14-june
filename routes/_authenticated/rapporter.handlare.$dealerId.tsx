import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDealerDetail } from "@/lib/reports.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/rapporter/handlare/$dealerId")({
  head: () => ({ meta: [{ title: "Handlarrapport — Min Bil Värdering" }] }),
  component: DealerDetailPage,
});

function DealerDetailPage() {
  const { dealerId } = Route.useParams();
  const fn = useServerFn(getDealerDetail);
  const today = new Date();
  const monthAgo = new Date(today.getTime() - 30 * 86400_000);
  const q = useQuery({
    queryKey: ["dealer-detail", dealerId],
    queryFn: () =>
      fn({
        data: {
          from: monthAgo.toISOString(),
          to: today.toISOString(),
          compare: false,
          dealer_id: dealerId,
        },
      }),
  });

  const pubs = (q.data?.publications ?? []) as any[];
  const offers = (q.data?.offers ?? []) as any[];
  const viewed = pubs.filter((p) => p.first_viewed_at).length;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/rapporter" className="text-xs text-muted-foreground hover:underline">
          ← Tillbaka till rapporter
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight mt-1">Handlardetalj</h1>
        <p className="text-sm text-muted-foreground">Senaste 30 dagarna</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <KPI label="Publikationer" value={String(pubs.length)} />
        <KPI label="Visade" value={String(viewed)} />
        <KPI label="Bud" value={String(offers.length)} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Publikationer</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Datum</th>
                <th className="px-3 py-2">Lead</th>
                <th className="px-3 py-2">Match-score</th>
                <th className="px-3 py-2">Visad</th>
                <th className="px-3 py-2">Antal visn.</th>
              </tr>
            </thead>
            <tbody>
              {pubs.map((p) => (
                <tr key={p.id} className="border-b border-border/40">
                  <td className="px-3 py-2 text-muted-foreground">
                    {new Date(p.created_at).toLocaleDateString("sv-SE")}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    <Link to="/leads/$leadId" params={{ leadId: p.lead_id }} className="hover:underline">
                      {p.lead_id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    {p.match_score != null && <Badge variant="secondary">{p.match_score}</Badge>}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {p.first_viewed_at
                      ? new Date(p.first_viewed_at).toLocaleDateString("sv-SE")
                      : "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{p.view_count ?? 0}</td>
                </tr>
              ))}
              {pubs.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">Inga publikationer.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Bud</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Datum</th>
                <th className="px-3 py-2">Lead</th>
                <th className="px-3 py-2 text-right">Belopp</th>
              </tr>
            </thead>
            <tbody>
              {offers.map((o) => (
                <tr key={o.id} className="border-b border-border/40">
                  <td className="px-3 py-2 text-muted-foreground">
                    {new Date(o.created_at).toLocaleDateString("sv-SE")}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    <Link to="/leads/$leadId" params={{ leadId: o.lead_id }} className="hover:underline">
                      {o.lead_id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {(o.amount ?? 0).toLocaleString("sv-SE")} kr
                  </td>
                </tr>
              ))}
              {offers.length === 0 && (
                <tr><td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">Inga bud.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <Card><CardContent className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </CardContent></Card>
  );
}
