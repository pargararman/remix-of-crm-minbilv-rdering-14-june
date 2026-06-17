import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSellerDetail } from "@/lib/reports.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/rapporter/saljare/$userId")({
  head: () => ({ meta: [{ title: "Säljarrapport — Min Bil Värdering" }] }),
  component: SellerDetailPage,
});

function SellerDetailPage() {
  const { userId } = Route.useParams();
  const fn = useServerFn(getSellerDetail);
  const today = new Date();
  const monthAgo = new Date(today.getTime() - 30 * 86400_000);
  const range = {
    from: monthAgo.toISOString(),
    to: today.toISOString(),
    compare: false,
    user_id: userId,
  };
  const q = useQuery({
    queryKey: ["seller-detail", userId],
    queryFn: () => fn({ data: range }),
  });

  const leads = (q.data?.leads ?? []) as any[];
  const lostReasons = (q.data?.lost_reasons ?? {}) as Record<string, number>;
  const byStage: Record<string, number> = {};
  for (const l of leads) byStage[l.stage] = (byStage[l.stage] ?? 0) + 1;
  const won = leads.filter((l) => l.stage === "vunnen").length;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/rapporter" className="text-xs text-muted-foreground hover:underline">
          ← Tillbaka till rapporter
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight mt-1">Säljardetalj</h1>
        <p className="text-sm text-muted-foreground">Senaste 30 dagarna · {userId}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <KPI label="Totalt leads" value={String(leads.length)} />
        <KPI label="Vunna" value={String(won)} />
        <KPI
          label="Konv. %"
          value={leads.length ? `${((won / leads.length) * 100).toFixed(1)}%` : "—"}
        />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Leads per steg</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {Object.entries(byStage).map(([k, n]) => (
            <Badge key={k} variant="secondary">{k}: {n}</Badge>
          ))}
          {Object.keys(byStage).length === 0 && (
            <p className="text-sm text-muted-foreground">Inga leads.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Tappade — orsaker</CardTitle></CardHeader>
        <CardContent>
          {Object.keys(lostReasons).length === 0 ? (
            <p className="text-sm text-muted-foreground">Inga tappade.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {Object.entries(lostReasons).map(([k, n]) => (
                <li key={k} className="flex justify-between">
                  <span>{k}</span>
                  <span className="tabular-nums">{n}</span>
                </li>
              ))}
            </ul>
          )}
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
