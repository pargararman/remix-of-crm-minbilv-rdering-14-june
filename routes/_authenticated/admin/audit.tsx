import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listAuditLogs, listAuditActions } from "@/lib/audit.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatRelative } from "@/lib/format";
import { ScrollText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/audit")({
  component: AuditPage,
});

function AuditPage() {
  const list = useServerFn(listAuditLogs);
  const actions = useServerFn(listAuditActions);
  const [action, setAction] = useState<string>("all");
  const [objectType, setObjectType] = useState<string>("");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [page, setPage] = useState(0);
  const limit = 50;

  const { data: actionsData } = useQuery({
    queryKey: ["audit-actions"],
    queryFn: () => actions(),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["audit", action, objectType, fromDate, toDate, page],
    queryFn: () =>
      list({
        data: {
          action: action === "all" ? null : action,
          objectType: objectType || null,
          fromDate: fromDate || null,
          toDate: toDate ? new Date(toDate + "T23:59:59").toISOString() : null,
          limit,
          offset: page * limit,
        },
      }),
  });

  return (
    <div className="space-y-4 max-w-7xl">
      <div className="flex items-center gap-3">
        <ScrollText className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-semibold">Audit-logg</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 p-4 rounded-md bg-elevated border border-border">
        <div>
          <Label className="text-xs">Åtgärd</Label>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alla</SelectItem>
              {actionsData?.actions.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Objekttyp</Label>
          <Input value={objectType} onChange={(e) => setObjectType(e.target.value)} placeholder="t.ex. lead" />
        </div>
        <div>
          <Label className="text-xs">Från</Label>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Till</Label>
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        <div className="flex items-end">
          <Button variant="outline" onClick={() => { setAction("all"); setObjectType(""); setFromDate(""); setToDate(""); setPage(0); }}>
            Återställ
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-elevated">
            <tr className="text-left">
              <th className="px-3 py-2">Tid</th>
              <th className="px-3 py-2">Användare</th>
              <th className="px-3 py-2">Åtgärd</th>
              <th className="px-3 py-2">Objekt</th>
              <th className="px-3 py-2">Diff</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Laddar…</td></tr>
            ) : (data?.rows ?? []).length === 0 ? (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Inga händelser</td></tr>
            ) : (
              data!.rows.map((r) => {
                const u = r.user_id ? data!.users[r.user_id] : null;
                return (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{formatRelative(r.created_at)}</td>
                    <td className="px-3 py-2">{u?.name || u?.email || (r.user_id ? r.user_id.slice(0, 8) : "system")}</td>
                    <td className="px-3 py-2"><span className="font-mono text-xs">{r.action}</span></td>
                    <td className="px-3 py-2 text-xs">
                      {r.object_type ? <div>{r.object_type}</div> : null}
                      {r.object_id ? <div className="font-mono text-muted-foreground">{r.object_id.slice(0, 8)}</div> : null}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.old_value || r.new_value ? (
                        <details>
                          <summary className="cursor-pointer text-primary">visa</summary>
                          <pre className="bg-background border border-border rounded p-2 mt-1 max-w-xl overflow-auto">
{JSON.stringify({ old: r.old_value, new: r.new_value }, null, 2)}
                          </pre>
                        </details>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {data?.count ?? 0} händelser totalt · sida {page + 1}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Föregående</Button>
          <Button variant="outline" disabled={!data || (page + 1) * limit >= data.count} onClick={() => setPage((p) => p + 1)}>Nästa</Button>
        </div>
      </div>
    </div>
  );
}
