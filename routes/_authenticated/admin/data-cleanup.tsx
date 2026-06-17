import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { listCleanupLeads } from "@/lib/data-cleanup.functions";

export const Route = createFileRoute("/_authenticated/admin/data-cleanup")({
  head: () => ({ meta: [{ title: "Data-cleanup — Admin" }] }),
  component: DataCleanupPage,
});

function DataCleanupPage() {
  const fetchFn = useServerFn(listCleanupLeads);
  const q = useQuery({ queryKey: ["data-cleanup"], queryFn: () => fetchFn() });
  const [tab, setTab] = useState("fuel");

  const buckets = useMemo(() => {
    const rows = (q.data ?? []) as any[];
    return {
      fuel: rows.filter((r) => !r.fuel || r.fuel === "okant" || r.fuel_needs_review),
      body: rows.filter((r) => !r.body_type || r.body_type === "okant" || r.body_type_needs_review),
      gearbox: rows.filter((r) => !r.gearbox || r.gearbox === "okant"),
      drive: rows.filter((r) => !r.drive_type || r.drive_type === "okant"),
    };
  }, [q.data]);

  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h1 className="text-xl font-semibold">Data-cleanup</h1>
        <p className="text-sm text-muted-foreground">
          Fordon med saknade eller osäkra fält. Öppna leadet för att fylla i.
        </p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="fuel">
            Drivmedel <Badge variant="secondary" className="ml-2">{buckets.fuel.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="body">
            Karosstyp <Badge variant="secondary" className="ml-2">{buckets.body.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="gearbox">
            Växellåda <Badge variant="secondary" className="ml-2">{buckets.gearbox.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="drive">
            Drivning <Badge variant="secondary" className="ml-2">{buckets.drive.length}</Badge>
          </TabsTrigger>
        </TabsList>

        {(["fuel", "body", "gearbox", "drive"] as const).map((key) => (
          <TabsContent key={key} value={key} className="pt-3">
            <CleanupList rows={buckets[key]} field={key} loading={q.isLoading} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function CleanupList({
  rows,
  field,
  loading,
}: {
  rows: any[];
  field: "fuel" | "body" | "gearbox" | "drive";
  loading: boolean;
}) {
  if (loading) return <p className="text-sm text-muted-foreground">Laddar…</p>;
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Inget att rensa här. 🎉</p>;
  const colMap = { fuel: "fuel", body: "body_type", gearbox: "gearbox", drive: "drive_type" } as const;
  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-muted-foreground text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-2 font-medium">Regnr</th>
              <th className="px-4 py-2 font-medium">Bil</th>
              <th className="px-4 py-2 font-medium">Kund</th>
              <th className="px-4 py-2 font-medium">Nuvarande</th>
              <th className="px-4 py-2 font-medium">Steg</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.lead_id} className="border-b border-border/50 hover:bg-elevated">
                <td className="px-4 py-2 font-mono">
                  <Link to="/leads/$leadId" params={{ leadId: r.lead_id }} className="hover:underline">
                    {r.lead?.registration_number ?? "—"}
                  </Link>
                </td>
                <td className="px-4 py-2">
                  {[r.brand, r.model].filter(Boolean).join(" ") || "—"}
                  {r.year && <span className="text-muted-foreground"> · {r.year}</span>}
                </td>
                <td className="px-4 py-2">{r.lead?.customer_name ?? "—"}</td>
                <td className="px-4 py-2 text-muted-foreground">
                  {r[colMap[field]] ?? <em>saknas</em>}
                </td>
                <td className="px-4 py-2"><Badge variant="secondary">{r.lead?.stage}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
