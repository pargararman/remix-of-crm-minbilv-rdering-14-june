import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listMyBids } from "@/lib/dealer-portal.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtKr, formatRelativeClose } from "@/lib/dealer-format";

export const Route = createFileRoute("/dealer/bids")({
  component: BidsPage,
});

function BidsPage() {
  const fn = useServerFn(listMyBids);
  const q = useQuery({ queryKey: ["dealer-my-bids"], queryFn: () => fn({}), refetchInterval: 15000 });
  const bids = q.data ?? [];

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Mina bud</h1>
      {bids.length === 0 && <p className="text-sm text-muted-foreground">Du har inte lagt några bud.</p>}
      {bids.map((b: any) => (
        <Link key={`${b.leadId}-${b.bidNumber}`} to="/dealer/cars/$leadId" params={{ leadId: b.leadId }}>
          <Card className="p-4 hover:bg-accent/40">
            <div className="flex justify-between items-center">
              <div>
                <div className="font-medium">{[b.brand, b.model, b.year].filter(Boolean).join(" ")}</div>
                <div className="text-xs text-muted-foreground">{b.registrationNumber} · {new Date(b.createdAt).toLocaleString("sv-SE")}</div>
              </div>
              <div className="text-right">
                <div className="font-semibold">{fmtKr(b.amount)}</div>
                <div className="text-xs text-muted-foreground">{formatRelativeClose(b.closesAt, b.endedAt)}</div>
                {b.won && <Badge className="mt-1">Vunnen</Badge>}
              </div>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}
