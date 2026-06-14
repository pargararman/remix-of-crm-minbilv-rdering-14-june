import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getDealerCarDetail,
  getAuctionPublicState,
  getMyBidStatus,
  placeBid,
} from "@/lib/dealer-portal.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtKr, formatCountdown, formatHm } from "@/lib/dealer-format";
import { toast } from "sonner";

export const Route = createFileRoute("/dealer/cars/$leadId")({
  component: CarDetailPage,
});

function useCountdown(closesAt: string | null) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const i = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(i);
  }, []);
  return formatCountdown(closesAt);
}

function CarDetailPage() {
  const { leadId } = Route.useParams();
  const qc = useQueryClient();
  const detailFn = useServerFn(getDealerCarDetail);
  const stateFn = useServerFn(getAuctionPublicState);
  const myFn = useServerFn(getMyBidStatus);
  const bidFn = useServerFn(placeBid);

  const detail = useQuery({
    queryKey: ["dealer-car", leadId],
    queryFn: () => detailFn({ data: { leadId } }),
    // Lead-tabellen har ingen realtime för handlare (PII-skydd) — polla i
    // stället så stage/auktionsslut syns inom rimlig tid.
    refetchInterval: 15000,
  });
  const pub = useQuery({
    queryKey: ["auction-public-state", leadId],
    queryFn: () => stateFn({ data: { leadId } }),
    refetchInterval: 10000,
  });
  const mine = useQuery({
    queryKey: ["my-bid-status", leadId],
    queryFn: () => myFn({ data: { leadId } }),
    refetchInterval: 10000,
  });

  // Realtime: refetch när nya bud kommer (auction_bids har dealer-RLS utan PII).
  useEffect(() => {
    const ch = supabase
      .channel(`auction-${leadId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "auction_bids", filter: `lead_id=eq.${leadId}` }, () => {
        qc.invalidateQueries({ queryKey: ["auction-public-state", leadId] });
        qc.invalidateQueries({ queryKey: ["my-bid-status", leadId] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [leadId, qc]);

  const countdown = useCountdown(pub.data?.closesAt ?? null);
  const minNext = (pub.data?.highestBid ?? 0) + 1000;
  const [amount, setAmount] = useState<string>("");

  useEffect(() => {
    if (pub.data && !amount) setAmount(String(minNext));
  }, [pub.data?.highestBid]); // eslint-disable-line

  const mutation = useMutation({
    mutationFn: (n: number) => bidFn({ data: { leadId, amount: n } }),
    onSuccess: () => {
      toast.success("Bud lagt");
      qc.invalidateQueries({ queryKey: ["auction-public-state", leadId] });
      qc.invalidateQueries({ queryKey: ["my-bid-status", leadId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Kunde inte lägga bud"),
  });

  if (detail.isLoading || !detail.data) return <p className="text-sm text-muted-foreground">Hämtar…</p>;
  const d = detail.data;
  const v = d.vehicle as any;
  const ended = !!d.lead.endedAt || (d.lead.closesAt && new Date(d.lead.closesAt).getTime() < Date.now());
  const m = mine.data;
  const ps = pub.data;

  const statusBadge = (() => {
    if (!m) return null;
    if (m.status === "leading") return <Badge className="bg-emerald-600 hover:bg-emerald-600">Du leder budgivningen</Badge>;
    if (m.status === "outbid") return <Badge variant="destructive">Överbjuden</Badge>;
    return <Badge variant="secondary">Inget bud än</Badge>;
  })();

  const fuelLabel = v?.fuel ?? null;
  const specRows: Array<[string, string | number | null | undefined]> = [
    ["Märke", v?.brand],
    ["Modell", v?.model],
    ["Årsmodell", v?.year],
    ["Miltal", v?.mileage_mil != null ? `${Number(v.mileage_mil).toLocaleString("sv-SE")} mil` : null],
    ["Bränsle", fuelLabel],
    ["Växellåda", v?.gearbox],
    ["Färg", v?.color],
    ["Karosstyp", v?.body_type],
    ["Servicebok", v?.service_book],
    ["Antal nycklar", v?.num_keys],
    ["Antal ägare", v?.num_owners],
    ["Senaste besiktning", v?.last_inspection],
  ];

  return (
    <div className="space-y-4">
      <Link to="/dealer" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4 mr-1" /> Tillbaka
      </Link>

      <Card className="p-4">
        <h1 className="text-xl font-semibold">
          {[v?.brand, v?.model, v?.year].filter(Boolean).join(" ") || d.lead.registrationNumber}
        </h1>
        <div className="text-sm text-muted-foreground mt-1">
          {d.lead.registrationNumber}
          {v?.mileage_mil ? ` · ${Number(v.mileage_mil).toLocaleString("sv-SE")} mil` : ""}
          {v?.fuel ? ` · ${v.fuel}` : ""}
          {v?.gearbox ? ` · ${v.gearbox}` : ""}
          {d.lead.city ? ` · ${d.lead.city}` : ""}
        </div>
        {d.pricingRange && (
          <div className="mt-2 text-sm">
            <span className="font-medium">Värderingsintervall: </span>
            {fmtKr(d.pricingRange.from)} – {fmtKr(d.pricingRange.to)}
          </div>
        )}
        {(d.lead.equipmentNotes || d.lead.freeText || d.publication.dealerComment) && (
          <div className="mt-3 space-y-2 text-sm">
            {d.publication.dealerComment && (
              <div className="bg-accent/40 rounded p-2">{d.publication.dealerComment}</div>
            )}
            {d.lead.equipmentNotes && <div><span className="font-medium">Utrustning: </span>{d.lead.equipmentNotes}</div>}
            {d.lead.freeText && <div className="text-muted-foreground whitespace-pre-wrap">{d.lead.freeText}</div>}
          </div>
        )}
      </Card>

      {/* Photos */}
      {d.photos && d.photos.length > 0 && (
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-3">Bilder</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {d.photos.map((p: any) => (
              <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded border border-border bg-muted">
                <img src={p.thumbUrl || p.url} alt={p.caption ?? "Bild"} loading="lazy" className="w-full h-full object-cover hover:opacity-90 transition" />
              </a>
            ))}
          </div>
        </Card>
      )}

      {/* Specs */}
      <Card className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-3">Fordonsspecifikation</div>
        <dl className="grid grid-cols-2 gap-y-1 text-sm">
          {specRows.filter(([, val]) => val != null && val !== "").map(([k, val]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-right font-medium">{String(val)}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {/* Documents */}
      {d.documents && d.documents.length > 0 && (
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-3">Dokument</div>
          <ul className="space-y-1 text-sm">
            {d.documents.map((doc: any) => (
              <li key={doc.id}>
                <a href={doc.url} target="_blank" rel="noreferrer" className="text-primary underline">
                  {doc.name}
                </a>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Notes for dealer */}
      {d.notes && d.notes.length > 0 && (
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-3">Anteckningar från säljaren</div>
          <ul className="space-y-3">
            {d.notes.map((n: any) => (
              <li key={n.id} className="text-sm">
                <div className="whitespace-pre-wrap">{n.content}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {n.authorName ?? "Säljare"} · {new Date(n.createdAt).toLocaleString("sv-SE")}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Card 1 — Din budstatus */}
      <Card className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Din budstatus</div>
        <div className="grid grid-cols-2 gap-y-1 text-sm">
          <div className="text-muted-foreground">Ditt bud</div>
          <div className="text-right font-medium">{fmtKr(m?.myHighestBid ?? null)}</div>
          <div className="text-muted-foreground">Högsta bud</div>
          <div className="text-right font-medium">{fmtKr(m?.highestBid ?? null)}</div>
          <div className="text-muted-foreground">Status</div>
          <div className="text-right">{statusBadge}</div>
        </div>
      </Card>

      {/* Bid form */}
      {!ended && d.lead.stage === "matchad" && (
        <Card className="p-4 space-y-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Lägg bud</div>
          <div className="text-xs text-muted-foreground">
            Minsta nästa bud: {fmtKr(minNext)}
          </div>
          <div className="flex gap-2">
            <Input
              type="number"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={String(minNext)}
              min={minNext}
              step={1000}
            />
            <Button
              onClick={() => {
                const n = parseInt(amount, 10);
                if (!Number.isFinite(n)) return toast.error("Ogiltigt belopp");
                if (n < minNext) return toast.error(`Minst ${fmtKr(minNext)}`);
                mutation.mutate(n);
              }}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Lägger…" : "Lägg bud"}
            </Button>
          </div>
        </Card>
      )}

      {ended && (
        <Card className="p-4">
          <div className="font-medium">Auktionen avslutad</div>
          <div className="text-sm text-muted-foreground mt-1">
            Slutligt högsta bud: {fmtKr(ps?.highestBid ?? null)}
          </div>
          {d.isWinner && (
            <div className="mt-2 text-sm">
              <Badge className="bg-emerald-600">Du vann auktionen</Badge>{" "}
              <Link to="/dealer/active" className="text-primary underline ml-2">
                Visa i Aktiv affär
              </Link>
            </div>
          )}
        </Card>
      )}

      {/* Card 2 — Anonymous bid history */}
      <Card className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Budhistorik</div>
          <div className="text-xs text-muted-foreground">
            Högsta {fmtKr(ps?.highestBid ?? null)} ·{" "}
            {ps?.activeBidderCount ?? 0} {ps?.activeBidderCount === 1 ? "aktiv budgivare" : "aktiva budgivare"}
            {!ended && ps?.closesAt && ` · Stänger om ${countdown}`}
          </div>
        </div>
        {(!ps?.history || ps.history.length === 0) && (
          <p className="text-sm text-muted-foreground">Inga bud lagda ännu.</p>
        )}
        <ul className="divide-y divide-border">
          {ps?.history.map((b) => (
            <li key={b.bidNumber} className="py-2 flex items-center justify-between text-sm">
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground tabular-nums w-12">{formatHm(b.createdAt)}</span>
                <span className="text-muted-foreground">Bud #{b.bidNumber}</span>
                {b.isMine && <Badge variant="outline" className="text-xs">Ditt bud</Badge>}
              </div>
              <span className="font-medium tabular-nums">{fmtKr(b.amount)}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground mt-3">
          Andra handlares identitet visas aldrig.
        </p>
      </Card>
    </div>
  );
}
