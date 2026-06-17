// Pricing-panel. Två lägen:
// - standalone: egen ["pricing", leadId]-query, egen mutation, egen SaveBar.
// - controlled: föräldern äger patch + server-data, ingen mutation, ingen SaveBar.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Info, History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CommitNumberField } from "./commit-inputs";
import { getPricing } from "@/lib/pricing.functions";
import { PricingHistoryModal } from "./pricing-history-modal";
import { formatDateTime } from "@/lib/format";
import { SaveBar } from "./save-bar";
import { usePricingMutation } from "@/hooks/use-pricing-mutation";

type FieldKey =
  | "customer_expectation"
  | "valuation_from"
  | "valuation_to"
  | "in_price_from"
  | "in_price_to"
  | "out_price_from"
  | "out_price_to";

const RANGES: { title: string; tip: string; from: FieldKey; to: FieldKey }[] = [
  { title: "Inpris", tip: "Spannet kunden får i SMS-värderingen.", from: "valuation_from", to: "valuation_to" },
  { title: "Utpris", tip: "Pris-spann mot handlare / försäljningsmål.", from: "out_price_from", to: "out_price_to" },
];

type ServerPricing = Record<string, unknown> & {
  updated_at?: string | null;
  updater?: { name?: string | null } | null;
  in_price?: number | null;
  out_price?: number | null;
};

type StandaloneProps = {
  leadId: string;
  onValuationSet?: () => void;
  embedded?: boolean;
  controlled?: false;
};

type ControlledProps = {
  leadId: string;
  controlled: true;
  patch: Record<string, unknown>;
  onPatchChange: (next: Record<string, unknown>) => void;
  serverPricing: ServerPricing | null;
  embedded?: boolean;
};

type Props = StandaloneProps | ControlledProps;

export function PricingPanel(props: Props) {
  if (props.controlled) {
    return <ControlledPricing {...props} />;
  }
  return <StandalonePricing {...props} />;
}

function ControlledPricing({ leadId, patch, onPatchChange, serverPricing, embedded }: ControlledProps) {
  const server = (serverPricing ?? {}) as ServerPricing;
  return (
    <Body
      leadId={leadId}
      server={server}
      patch={patch}
      onChange={(k, v) => onPatchChange({ ...patch, [k]: v })}
      embedded={embedded}
      saveBar={null}
    />
  );
}

function StandalonePricing({ leadId, onValuationSet, embedded }: StandaloneProps) {
  const fetchFn = useServerFn(getPricing);
  const q = useQuery({ queryKey: ["pricing", leadId], queryFn: () => fetchFn({ data: { leadId } }) });
  const mutation = usePricingMutation(leadId);
  const [patch, setPatch] = useState<Record<string, unknown>>({});
  const server = (q.data?.pricing ?? {}) as ServerPricing;
  const isDirty = Object.keys(patch).length > 0;
  const lastSavedAt = server.updated_at ? new Date(server.updated_at as string).getTime() : null;

  const onSave = () => {
    const snapshot = { ...patch };
    const touchedValuation = "valuation_from" in snapshot || "valuation_to" in snapshot;
    mutation.mutate(snapshot, {
      onSuccess: () => {
        setPatch((cur) => {
          const next = { ...cur };
          for (const k of Object.keys(snapshot)) delete next[k];
          return next;
        });
        if (touchedValuation && onValuationSet) onValuationSet();
      },
    });
  };

  return (
    <Body
      leadId={leadId}
      server={server}
      patch={patch}
      onChange={(k, v) => setPatch((p) => ({ ...p, [k]: v }))}
      embedded={embedded}
      saveBar={
        <SaveBar
          isDirty={isDirty}
          isSaving={mutation.isPending}
          lastSavedAt={lastSavedAt}
          onSave={onSave}
        />
      }
    />
  );
}

function Body({
  leadId,
  server,
  patch,
  onChange,
  embedded,
  saveBar,
}: {
  leadId: string;
  server: ServerPricing;
  patch: Record<string, unknown>;
  onChange: (k: string, v: unknown) => void;
  embedded?: boolean;
  saveBar: React.ReactNode;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);

  const numericValue = (k: FieldKey): number | null => {
    if (k in patch) {
      const v = patch[k];
      return v == null ? null : Number(v);
    }
    let raw = server[k];
    if (raw == null && k === "in_price_from") raw = server.in_price;
    if (raw == null && k === "in_price_to") raw = server.in_price;
    if (raw == null && k === "out_price_from") raw = server.out_price;
    if (raw == null && k === "out_price_to") raw = server.out_price;
    return raw == null ? null : Number(raw);
  };

  const notes = ("pricing_notes" in patch ? patch.pricing_notes : server.pricing_notes) as string | null;
  const updater = server.updater?.name ?? null;
  const updatedAt = server.updated_at;

  const renderAmount = (field: FieldKey) => (
    <div className="relative">
      <CommitNumberField
        value={numericValue(field)}
        onCommit={(v) => onChange(field, v)}
        inputClassName="pr-8 text-right"
        placeholder="0"
        hideLabel
      />
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
        kr
      </span>
    </div>
  );

  const body = (
    <>
      {saveBar}
      <TooltipProvider delayDuration={200}>
        <div className="space-y-1">
          <Label className="text-xs flex items-center gap-1">
            Kundens förväntan
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3 w-3 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent>Vad kunden vill ha för bilen.</TooltipContent>
            </Tooltip>
          </Label>
          {renderAmount("customer_expectation")}
        </div>

        {RANGES.map((r) => (
          <div key={r.title} className="space-y-1">
            <div className="flex items-center gap-1">
              <Label className="text-xs">{r.title}</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>{r.tip}</TooltipContent>
              </Tooltip>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-0.5">
                <Label className="text-[10px] uppercase text-muted-foreground tracking-wide">Från</Label>
                {renderAmount(r.from)}
              </div>
              <div className="space-y-0.5">
                <Label className="text-[10px] uppercase text-muted-foreground tracking-wide">Till</Label>
                {renderAmount(r.to)}
              </div>
            </div>
          </div>
        ))}

        <div className="space-y-1">
          <Label className="text-xs flex items-center gap-1">
            Priskommentar
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3 w-3 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent>Säljarens resonemang (internt).</TooltipContent>
            </Tooltip>
          </Label>
          <Textarea
            value={notes ?? ""}
            onChange={(e) => onChange("pricing_notes", e.target.value)}
            rows={3}
            className="text-sm max-h-28 resize-none"
            maxLength={2000}
          />
        </div>
      </TooltipProvider>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground truncate">
          {updatedAt ? (
            <>Sparat senast: {formatDateTime(updatedAt as string)}{updater ? ` av ${updater}` : ""}</>
          ) : "—"}
        </p>
        <Button size="sm" variant="ghost" onClick={() => setHistoryOpen(true)} className="h-7 px-2 text-xs">
          <History className="h-3.5 w-3.5 mr-1" />
          Historik
        </Button>
      </div>
      <PricingHistoryModal leadId={leadId} open={historyOpen} onOpenChange={setHistoryOpen} />
    </>
  );

  if (embedded) {
    return <div className="space-y-3">{body}</div>;
  }
  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm">Prissättning</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-3">{body}</CardContent>
    </Card>
  );
}
