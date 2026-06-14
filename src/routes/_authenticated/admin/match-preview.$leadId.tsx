// Admin: matchnings-preview för en lead.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { matchDealersForLead } from "@/lib/dealers.functions";

export const Route = createFileRoute("/_authenticated/admin/match-preview/$leadId")({
  head: () => ({ meta: [{ title: "Match-preview — Min Bil Värdering" }] }),
  component: MatchPreview,
});

function MatchPreview() {
  const { leadId } = Route.useParams();
  const fn = useServerFn(matchDealersForLead);
  const q = useQuery({ queryKey: ["match-preview", leadId], queryFn: () => fn({ data: { leadId } }) });
  const matches = q.data?.matches ?? [];

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/leads/$leadId" params={{ leadId }}><ArrowLeft className="h-4 w-4 mr-1" /> Till lead</Link>
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">Matchnings-preview</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{matches.length} handlare matchar</CardTitle>
        </CardHeader>
        <CardContent className="p-0 divide-y">
          {q.isLoading && <p className="p-4 text-sm text-muted-foreground">Räknar…</p>}
          {!q.isLoading && matches.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">Inga aktiva handlare matchar denna lead.</p>
          )}
          {matches.map((m: any) => (
            <div key={m.dealer_id} className="p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium text-sm">{m.company_name}</div>
                <Badge variant={m.match_score >= 70 ? "default" : "secondary"}>{m.match_score}% match</Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                {m.city}{m.region ? ` · ${m.region}` : ""}
                {m.distance_km != null ? ` · ${m.distance_km} km` : ""}
              </div>
              {m.match_reasons.length > 0 && (
                <ul className="text-xs text-muted-foreground list-disc ml-5">
                  {m.match_reasons.map((r: string, i: number) => <li key={i}>{r}</li>)}
                </ul>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
