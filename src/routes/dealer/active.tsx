import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listMyActiveDeals } from "@/lib/dealer-portal.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtKr } from "@/lib/dealer-format";

export const Route = createFileRoute("/dealer/active")({
  component: ActivePage,
});

function ActivePage() {
  const fn = useServerFn(listMyActiveDeals);
  const q = useQuery({ queryKey: ["dealer-active"], queryFn: () => fn({}), refetchInterval: 15000 });
  const deals = q.data ?? [];

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Aktiv affär</h1>
      {deals.length === 0 && <p className="text-sm text-muted-foreground">Inga aktiva affärer.</p>}
      {deals.map((d: any) => (
        <Card key={d.leadId} className="p-4 space-y-2">
          <div className="flex justify-between items-start gap-3 flex-wrap">
            <div>
              <div className="font-medium">{[d.brand, d.model, d.year].filter(Boolean).join(" ")}</div>
              <div className="text-xs text-muted-foreground">{d.registrationNumber}{d.city ? ` · ${d.city}` : ""}</div>
            </div>
            <div className="text-right">
              <div className="font-semibold">{fmtKr(d.winningBid)}</div>
              <Badge className="mt-1">{d.stage === "bud_mottaget" ? "Du vann" : "Aktiv affär"}</Badge>
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            Nästa steg: vänta på instruktioner från Min Bil Värdering om kontraktssignering och upphämtning.
          </div>
          <Link to="/dealer/cars/$leadId" params={{ leadId: d.leadId }} className="text-sm text-primary underline">
            Visa affär
          </Link>
        </Card>
      ))}
    </div>
  );
}
