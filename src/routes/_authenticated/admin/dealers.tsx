// Admin: hantera handlare.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { listDealers } from "@/lib/dealers.functions";

export const Route = createFileRoute("/_authenticated/admin/dealers")({
  head: () => ({ meta: [{ title: "Handlare — Min Bil Värdering" }] }),
  component: DealersList,
});

function DealersList() {
  const fn = useServerFn(listDealers);
  const [search, setSearch] = useState("");
  const q = useQuery({
    queryKey: ["dealers", search],
    queryFn: () => fn({ data: { search: search || undefined } }),
  });
  const dealers = q.data?.dealers ?? [];

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Handlare</h1>
          <p className="text-sm text-muted-foreground">Hantera handlarkonton och inställningar.</p>
        </div>
        <Button asChild>
          <Link to="/admin/dealers/$dealerId" params={{ dealerId: "new" }}>
            <Plus className="h-4 w-4 mr-1" /> Ny handlare
          </Link>
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Sök på namn, e-post eller orgnr…" className="pl-9"
          value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Card>
        <CardContent className="p-0 divide-y">
          {q.isLoading && <p className="p-4 text-sm text-muted-foreground">Laddar…</p>}
          {!q.isLoading && dealers.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">Inga handlare ännu.</p>
          )}
          {dealers.map((d: any) => (
            <Link
              key={d.id}
              to="/admin/dealers/$dealerId"
              params={{ dealerId: d.id }}
              className="flex items-center justify-between gap-3 p-3 hover:bg-muted/30 transition-colors"
            >
              <div className="min-w-0">
                <div className="font-medium text-sm">{d.company_name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {d.email} · {d.city}{d.region ? ` · ${d.region}` : ""} · Radie {d.buying_radius_km} km
                </div>
              </div>
              <Badge variant={d.status === "active" ? "default" : "secondary"}>{d.status}</Badge>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
