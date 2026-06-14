// Lista av handlare som leaden publicerats till.
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, Circle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listLeadPublications, revokePublication } from "@/lib/dealer-publications.functions";
import { formatRelative } from "@/lib/format";

export function PublicationsPanel({ leadId }: { leadId: string }) {
  const listFn = useServerFn(listLeadPublications);
  const revokeFn = useServerFn(revokePublication);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["lead-publications", leadId], queryFn: () => listFn({ data: { leadId } }) });
  const pubs = q.data?.publications ?? [];

  const handleRevoke = async (id: string, name: string) => {
    if (!confirm(`Ta bort ${name}s tillgång till denna lead?`)) return;
    await revokeFn({ data: { publicationId: id } });
    qc.invalidateQueries({ queryKey: ["lead-publications", leadId] });
  };

  if (pubs.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-base font-semibold">Publicerad till handlare ({pubs.length})</h3>
      <div className="space-y-1">
        {pubs.map((p: any) => (
          <div key={p.id} className="flex items-center gap-3 p-2 rounded border hover:bg-muted/30">
            {p.first_viewed_at ? <CheckCircle className="h-4 w-4 text-green-500" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{p.dealer?.company_name ?? "—"}</div>
              <div className="text-xs text-muted-foreground">
                {p.view_count > 0
                  ? `Visad ${p.view_count} ggr · senast ${formatRelative(p.first_viewed_at ?? p.created_at)}`
                  : "Aldrig öppnat"}
                {p.match_score != null && ` · ${p.match_score}% match`}
              </div>
            </div>
            {p.interest_marked_at && <Badge variant="secondary">INTRESSE</Badge>}
            <Button size="sm" variant="ghost" onClick={() => handleRevoke(p.id, p.dealer?.company_name ?? "handlaren")}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
