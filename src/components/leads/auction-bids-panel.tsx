import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  listAuctionBidsForLead,
  selectWinningDealer,
  extendAuctionClose,
} from "@/lib/auction-seller.functions";
import { toast } from "sonner";

function fmtKr(n: number | null) {
  return n === null || n === undefined ? "—" : `${n.toLocaleString("sv-SE")} kr`;
}

export function AuctionBidsPanel({ leadId, stage }: { leadId: string; stage: string }) {
  const qc = useQueryClient();
  const fn = useServerFn(listAuctionBidsForLead);
  const winFn = useServerFn(selectWinningDealer);
  const extFn = useServerFn(extendAuctionClose);
  const q = useQuery({
    queryKey: ["seller-auction-bids", leadId],
    queryFn: () => fn({ data: { leadId } }),
    refetchInterval: 10000,
  });

  useEffect(() => {
    const ch = supabase
      .channel(`seller-auction-${leadId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "auction_bids", filter: `lead_id=eq.${leadId}` }, () => {
        qc.invalidateQueries({ queryKey: ["seller-auction-bids", leadId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [leadId, qc]);

  const winMut = useMutation({
    mutationFn: (args: { dealerId: string; confirmEarly: boolean }) =>
      winFn({ data: { leadId, dealerId: args.dealerId, confirmEarly: args.confirmEarly } }),
    onSuccess: () => {
      toast.success("Vinnande handlare vald");
      qc.invalidateQueries({ queryKey: ["seller-auction-bids", leadId] });
      qc.invalidateQueries({ queryKey: ["lead-detail", leadId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Misslyckades"),
  });

  const extMut = useMutation({
    mutationFn: (mins: number) => extFn({ data: { leadId, minutes: mins } }),
    onSuccess: () => {
      toast.success("Auktionen förlängd");
      qc.invalidateQueries({ queryKey: ["seller-auction-bids", leadId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Misslyckades"),
  });

  const [showAll, setShowAll] = useState(false);
  if (!q.data) return null;
  const { bids, closesAt, endedAt, winningDealerId } = q.data;

  // Group highest per dealer
  const perDealer = new Map<string, { dealerId: string; dealerName: string; amount: number }>();
  for (const b of bids) {
    const cur = perDealer.get(b.dealerId);
    if (!cur || b.amount > cur.amount) perDealer.set(b.dealerId, { dealerId: b.dealerId, dealerName: b.dealerName, amount: b.amount });
  }
  const ranked = [...perDealer.values()].sort((a, b) => b.amount - a.amount);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div>
          <div className="text-sm font-semibold">Auktionsbud</div>
          <div className="text-xs text-muted-foreground">
            {endedAt ? `Avslutad ${new Date(endedAt).toLocaleString("sv-SE")}` :
              closesAt ? `Stänger ${new Date(closesAt).toLocaleString("sv-SE")}` : "Inte startad"}
          </div>
        </div>
        {!endedAt && closesAt && stage === "matchad" && (
          <Button size="sm" variant="outline" onClick={() => extMut.mutate(15)} disabled={extMut.isPending}>
            +15 min
          </Button>
        )}
      </div>

      {ranked.length === 0 && <p className="text-sm text-muted-foreground">Inga bud än.</p>}

      <div className="space-y-2">
        {ranked.map((d, i) => (
          <div key={d.dealerId} className="flex items-center justify-between border-b border-border/50 pb-2 last:border-b-0">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-5">#{i + 1}</span>
              <span className="font-medium">{d.dealerName}</span>
              {winningDealerId === d.dealerId && <Badge>Vinnare</Badge>}
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold tabular-nums">{fmtKr(d.amount)}</span>
              {!winningDealerId && stage === "matchad" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const stillOpen = !endedAt && closesAt && new Date(closesAt).getTime() > Date.now();
                    const msg = stillOpen
                      ? `OBS: Auktionen pågår till ${new Date(closesAt!).toLocaleString("sv-SE")}.\n\nVälja ${d.dealerName} som vinnare NU avslutar auktionen i förtid — övriga handlare kan inte lägga fler bud. Detta loggas.\n\nFortsätt?`
                      : `Välj ${d.dealerName} som vinnare?`;
                    if (confirm(msg)) winMut.mutate({ dealerId: d.dealerId, confirmEarly: !!stillOpen });
                  }}
                  disabled={winMut.isPending}
                >
                  Välj vinnare
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {bids.length > 0 && (
        <details open={showAll} onToggle={(e) => setShowAll((e.target as HTMLDetailsElement).open)}>
          <summary className="text-xs text-muted-foreground cursor-pointer">Visa all budhistorik ({bids.length})</summary>
          <ul className="mt-2 text-xs space-y-1">
            {bids.map((b: any) => (
              <li key={b.id} className="flex justify-between">
                <span>{new Date(b.createdAt).toLocaleString("sv-SE")} · #{b.bidNumber} · {b.dealerName}</span>
                <span className="tabular-nums">{fmtKr(b.amount)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}
