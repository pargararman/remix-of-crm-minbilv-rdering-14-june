import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listMyWonDeals } from "@/lib/dealer-portal.functions";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/dealer/won")({
  component: WonPage,
});

function WonPage() {
  const fn = useServerFn(listMyWonDeals);
  const q = useQuery({ queryKey: ["dealer-won"], queryFn: () => fn({}) });
  const deals = q.data ?? [];
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Vunna affärer</h1>
      {deals.length === 0 && <p className="text-sm text-muted-foreground">Inga avslutade affärer ännu.</p>}
      {deals.map((d: any) => (
        <Card key={d.leadId} className="p-4">
          <div className="font-medium">{[d.brand, d.model, d.year].filter(Boolean).join(" ")}</div>
          <div className="text-xs text-muted-foreground">{d.registrationNumber}{d.city ? ` · ${d.city}` : ""}</div>
        </Card>
      ))}
    </div>
  );
}
