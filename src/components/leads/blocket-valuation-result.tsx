// Blocket-värdering: resultatpanel som visas under externa knappar i
// QuickValuationPanel. Presentationskomponent — all data kommer från
// valuateBlocket-serverfunktionen via föräldern.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BarChart3, ArrowDown, RefreshCw, AlertCircle } from "lucide-react";
import type { ValuationResult } from "@/lib/valuation/types";

const sek = (n: number | null | undefined) =>
  n == null ? "—" : `${n.toLocaleString("sv-SE")} kr`;

interface Props {
  result: ValuationResult | null;
  isPending: boolean;
  isError?: boolean;
  onApply: (r: ValuationResult) => void;
  onRetry?: () => void;
}

export function BlocketValuationResult({ result, isPending, isError, onApply, onRetry }: Props) {
  const [showComps, setShowComps] = useState(false);

  if (isPending) {
    return (
      <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground flex items-center gap-2">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Hämtar jämförbara annonser från Blocket…
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

  return (
    <div className="rounded-md border border-border bg-muted/30 p-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <BarChart3 className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium">Blocket-värdering (API)</span>
        <span className="text-[11px] rounded px-2 py-0.5 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
          {result.sampleSize} jämförbara annonser
        </span>
        <span className="ml-auto text-[11px] text-muted-foreground">via blocket.se · server-side</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Metric label="Marknad (P25–P75)" value={`${sek(result.marketLow)} – ${sek(result.marketHigh)}`} />
        <Metric label="Median utannonserat" value={sek(result.marketMedian)} />
        <Metric label="Est. marknadspris (−5%)" value={`${sek(result.soldLow)} – ${sek(result.soldHigh)}`} />
        <Metric label="Träffsäkerhet" value={`${Math.round(result.confidence * 100)} %`} />
      </div>

      {result.comps.length > 0 && (
        <div className="text-xs">
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => setShowComps((s) => !s)}
          >
            {showComps ? "Dölj" : "Visa"} jämförbara annonser ({result.comps.length})
          </button>
          {showComps && (
            <div className="mt-2 space-y-1">
              {result.comps.slice(0, 12).map((c, i) => (
                <div key={c.id ?? i} className="flex justify-between gap-2 border-b border-border/60 py-0.5 last:border-0">
                  <span className="text-muted-foreground truncate">
                    {c.title ?? "Annons"}{c.year ? ` · ${c.year}` : ""}{c.mileage_mil != null ? ` · ${c.mileage_mil.toLocaleString("sv-SE")} mil` : ""}
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-background p-2">
      <p className="text-[11px] text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm font-medium leading-tight">{value}</p>
    </div>
  );
}
