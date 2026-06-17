import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listAvailableCars } from "@/lib/dealer-portal.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatRelativeClose, fmtKr } from "@/lib/dealer-format";

export const Route = createFileRoute("/dealer/")({
  component: AvailablePage,
});

function AvailablePage() {
  const fn = useServerFn(listAvailableCars);
  const q = useQuery({
    queryKey: ["dealer-available"],
    queryFn: () => fn({}),
    refetchInterval: 15000,
  });

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Hämtar bilar…</p>;
  const cars = q.data ?? [];

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Tillgängliga bilar</h1>
      {cars.length === 0 && (
        <p className="text-sm text-muted-foreground">Inga aktiva auktioner just nu.</p>
      )}
      <div className="grid gap-3">
        {cars.map((c) => (
          <Link key={c.leadId} to="/dealer/cars/$leadId" params={{ leadId: c.leadId }}>
            <Card className="p-4 hover:bg-accent/40 transition-colors">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-medium">
                    {[c.brand, c.model, c.year].filter(Boolean).join(" ")}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {c.registrationNumber} · {c.mileageMil ? `${c.mileageMil.toLocaleString("sv-SE")} mil` : "—"}
                    {c.city ? ` · ${c.city}` : ""}
                    {c.fuel ? ` · ${c.fuel}` : ""}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold">
                    {c.highestBid !== null ? fmtKr(c.highestBid) : "Inga bud"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatRelativeClose(c.closesAt, c.endedAt)}
                  </div>
                  {c.myHighestBid !== null && (
                    <Badge variant="secondary" className="mt-1">
                      Ditt bud: {fmtKr(c.myHighestBid)}
                    </Badge>
                  )}
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
