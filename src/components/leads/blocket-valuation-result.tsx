// Blocket-värdering: resultatpanel som visas under externa knappar.
// Utpris = lower-market dealer resale price. Inpris = customer-facing offer range.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BarChart3, ArrowDown, RefreshCw, AlertCircle, ExternalLink } from "lucide-react";
import type { ValuationResult } from "@/lib/valuation/types";

const sek = (n: number | null | undefined) =>
  n == null ? "—" : `${n.toLocaleString("sv-SE")} kr`;

interface Props {
  result: ValuationResult | null;
  isPending: boolean;
  isError?: boolean;
  /** Registreringsnummer visas i panelhuvudet så värderingen knyts till bilen. */
  regnr?: string | null;
  onApply: (r: ValuationResult) => void;
  onRetry?: () => void;
}

export function BlocketValuationResult({ result, isPending, isError, regnr, onApply, onRetry }: Props) {
  const [showComps, setShowComps] = useState(false);

  if (isPending) {
    return (
      <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground flex items-center gap-2">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Hämtar handlarannonser från Blocket…
      </div>
    );
  }

  if (isError || (result && !result.ok)) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-4 w-4" />
          {result?.note ?? "Kunde inte hämta Blocket-värdering."}
        </span>
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            Försök igen
          </Button>
        )}
      </div>
    );
  }

  if (!result) return null;
  const confidenceTone =
    result.confidenceLevel === "high"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
      : result.confidenceLevel === "medium"
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
        : "bg-destructive/10 text-destructive";

  return (
    <div className="rounded-md border border-border bg-muted/30 p-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <BarChart3 className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium">Blocket-värdering (API)</span>
        {regnr && (
          <span className="text-[11px] font-mono tracking-wide rounded px-1.5 py-0.5 bg-background border border-border">
            {regnr}
          </span>
        )}
        <span className="text-[11px] rounded px-2 py-0.5 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
          {result.sampleSize} använda · {result.comparableCount} jämförbara · {result.totalCount} träffar
        </span>
        <span className={`text-[11px] rounded px-2 py-0.5 ${confidenceTone}`}>
          {result.confidenceLevel.toUpperCase()} · stage {result.fallbackStage ?? "—"} · {result.smsEligible ? "SMS OK" : "SMS stopp"}
        </span>
        <span className="ml-auto text-[11px] text-muted-foreground">via blocket.se · server-side</span>
      </div>

      {result.note && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">{result.note}</p>
      )}

      {result.customerOffer && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Metric
              label="Inpris till kund"
              value={`${sek(result.customerOffer.customerLow)}–${sek(result.customerOffer.customerHigh)}`}
              strong
            />
            <Metric label="Utpris internt" value={sek(result.customerOffer.referencePrice)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Total marginal/buffert" value={sek(result.customerOffer.deduction)} />
            <Metric label="Marknadskontext (median)" value={sek(result.marketMedian)} />
          </div>
          <p className="rounded-md bg-background p-2 text-[11px] leading-relaxed text-muted-foreground">
            {result.customerOffer.explanationText}
          </p>
          {!result.smsEligible && result.sanityChecks.blockers.length > 0 && (
            <p className="rounded-md bg-destructive/5 border border-destructive/20 p-2 text-[11px] leading-relaxed text-destructive">
              Auto-SMS stoppas: {result.sanityChecks.blockers.join(" ")}
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <RefCard label="Billigast" comp={result.cheapest} />
        <RefCard label="Dyrast" comp={result.mostExpensive} />
      </div>

      {result.comps.length > 0 && (
        <div className="text-xs">
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => setShowComps((s) => !s)}
          >
            {showComps ? "Dölj" : "Visa"} använda annonser ({result.comps.length})
          </button>
          {showComps && (
            <div className="mt-2 space-y-1">
              {result.comps.map((c, i) => (
                <div key={c.id ?? i} className="flex items-center justify-between gap-2 border-b border-border/60 py-0.5 last:border-0">
                  <span className="text-muted-foreground truncate">
                    {c.url ? (
                      <a href={c.url} target="_blank" rel="noopener noreferrer" className="hover:underline inline-flex items-center gap-1">
                        {c.title ?? "Annons"}<ExternalLink className="h-3 w-3 opacity-70" />
                      </a>
                    ) : (
                      c.title ?? "Annons"
                    )}
                    {c.year ? ` · ${c.year}` : ""}
                    {c.mileage_mil != null ? ` · ${c.mileage_mil.toLocaleString("sv-SE")} mil` : ""}
                    {c.isDealer ? <span className="ml-1 rounded bg-background border border-border px-1 text-[10px]">Handlare</span> : null}
                  </span>
                  <span className="whitespace-nowrap">{sek(c.price)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Button size="sm" onClick={() => onApply(result)}>
        <ArrowDown className="h-3.5 w-3.5 mr-1" />
        Använd i prissättning
      </Button>
    </div>
  );
}

function Metric({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-md bg-background p-2">
      <p className="text-[11px] text-muted-foreground mb-0.5">{label}</p>
      <p className={strong ? "text-base font-semibold leading-tight" : "text-sm font-medium leading-tight"}>{value}</p>
    </div>
  );
}

function RefCard({ label, comp }: { label: string; comp: { price: number; title?: string; url?: string | null } | null }) {
  const sek2 = (n: number | null | undefined) => (n == null ? "—" : `${n.toLocaleString("sv-SE")} kr`);
  return (
    <div className="rounded-md bg-background p-2">
      <p className="text-[11px] text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm font-medium leading-tight">
        {comp?.url ? (
          <a href={comp.url} target="_blank" rel="noopener noreferrer" className="hover:underline inline-flex items-center gap-1">
            {sek2(comp?.price)}<ExternalLink className="h-3 w-3 opacity-70" />
          </a>
        ) : (
          sek2(comp?.price)
        )}
      </p>
    </div>
  );
}
