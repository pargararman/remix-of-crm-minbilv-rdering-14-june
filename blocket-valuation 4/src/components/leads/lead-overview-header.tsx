// Stor overview-panel som visas högst upp på lead-detalj.
import { Link } from "@tanstack/react-router";
import { Phone, Mail, MapPin, User, Car, Wallet, Wrench, Calendar, KeyRound } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StageRulesPopover } from "@/components/leads/stage-rules-popover";
import { LOST_REASONS } from "@/lib/lost-reasons";
import { ExternalButtons } from "@/components/leads/external-buttons";
import { BlocketValuationResult } from "@/components/leads/blocket-valuation-result";
import { valuateBlocket } from "@/lib/valuation.functions";
import { updatePricing } from "@/lib/pricing.functions";
import type { ValuationResult } from "@/lib/valuation/types";
import { formatPhone, formatRelative } from "@/lib/format";

function kr(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n.toLocaleString("sv-SE")} kr`;
}

function range(a: number | null | undefined, b: number | null | undefined): string {
  if (a == null && b == null) return "—";
  if (a != null && b != null) return `${a.toLocaleString("sv-SE")}–${b.toLocaleString("sv-SE")} kr`;
  return kr(a ?? b);
}

function formatExpectation(leadText: string | null | undefined, pricingNum: number | null | undefined): string {
  if (leadText && leadText.trim()) return leadText.trim();
  return kr(pricingNum);
}

interface Props {
  lead: any;
  vehicle: any;
  pricing: any;
  settings?: any;
}

export function LeadOverviewHeader({ lead, vehicle, pricing, settings }: Props) {
  const qc = useQueryClient();
  const runValuateBlocket = useServerFn(valuateBlocket);
  const runUpdatePricing = useServerFn(updatePricing);

  // Blocket-API-värdering (server-side). Header-knappen "Blocket" triggar denna.
  const blocket = useMutation({
    mutationFn: () => runValuateBlocket({ data: { leadId: lead.id } }) as Promise<ValuationResult>,
    onError: () => toast.error("Kunde inte hämta Blocket-värdering."),
  });

  // Header har ingen SaveBar -> "Använd i prissättning" sparar direkt och
  // uppdaterar pris-cachen så hela profilen speglar spannet.
  const apply = useMutation({
    mutationFn: (r: ValuationResult) =>
      runUpdatePricing({
        data: {
          leadId: lead.id,
          valuation_from: r.soldLow,
          valuation_to: r.soldHigh,
          out_price_from: r.marketLow,
          out_price_to: r.marketHigh,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pricing", lead.id] });
      toast.success("Blocket-spann sparat i prissättningen.");
    },
    onError: () => toast.error("Kunde inte spara prissättningen."),
  });

  const applyBlocket = (r: ValuationResult) => {
    if (r.ok) apply.mutate(r);
  };

  return (
    <Card className="border-border">
      <CardContent className="p-4 md:p-5 grid gap-4 md:grid-cols-3">
        {/* Kund */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold">{lead.customer_name ?? "Okänd kund"}</span>
          </div>
          <div className="text-sm space-y-1">
            <div className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
              <a href={`tel:${lead.phone}`} className="hover:underline tabular-nums">{formatPhone(lead.phone)}</a>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
              <a href={`mailto:${lead.email}`} className="hover:underline">{lead.email}</a>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{lead.city ?? "—"}{lead.region ? `, ${lead.region}` : ""}</span>
            </div>
            <div className="flex gap-3 text-xs text-muted-foreground pt-1">
              <span>Källa: {lead.source}</span>
              <span>·</span>
              <span>Inkommen {formatRelative(lead.created_at)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <Badge variant="secondary">{lead.stage}</Badge>
              <StageRulesPopover stage={lead.stage} />
              {lead.owner_id ? (
                <Badge variant="outline">Ansvarig tilldelad</Badge>
              ) : (
                <Badge variant="outline" className="text-status-followup border-status-followup/40">Otilldelad</Badge>
              )}
            </div>
            {lead.stage === "forlorad" && lead.lost_reason_code && (
              <div className="text-destructive text-xs font-medium pt-1">
                Förlorad anledning: {LOST_REASONS.find(r => r.value === lead.lost_reason_code)?.label ?? lead.lost_reason_code}
                {lead.lost_reason_text && ` - ${lead.lost_reason_text}`}
              </div>
            )}
          </div>
        </div>

        {/* Bil */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Car className="h-4 w-4 text-muted-foreground" />
            <span className="font-mono text-base font-semibold tracking-wide">{lead.registration_number}</span>
          </div>
          <div className="text-sm">
            <div className="font-medium">
              {[vehicle?.brand, vehicle?.model, vehicle?.version].filter(Boolean).join(" ") || "—"}
            </div>
            <div className="text-muted-foreground text-xs flex flex-wrap gap-x-2">
              {vehicle?.year && <span>{vehicle.year}</span>}
              {vehicle?.mileage_mil != null && <span>· {vehicle.mileage_mil.toLocaleString("sv-SE")} mil</span>}
              {vehicle?.fuel && <span>· {vehicle.fuel}</span>}
              {vehicle?.gearbox && <span>· {vehicle.gearbox}</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {vehicle?.service_book && <Chip icon={Wrench} label={`Servicebok: ${vehicle.service_book}`} />}
            {vehicle?.tires && <Chip label={`Däck: ${vehicle.tires}`} />}
            {vehicle?.keys_count && <Chip icon={KeyRound} label={`Nycklar: ${vehicle.keys_count}`} />}
            {vehicle?.condition && <Chip label={`Skick: ${vehicle.condition}`} />}
            {vehicle?.damage_notes && <Chip label="Skador finns" tone="urgent" />}
            {vehicle?.inspection_until && (
              <Chip icon={Calendar} label={`Bes: ${vehicle.inspection_until}`} />
            )}
          </div>
          {(vehicle?.equipment_notes || lead.equipment_notes) && (
            <div className="text-xs text-muted-foreground pt-1 line-clamp-2">
              <span className="font-medium text-foreground">Övrigt: </span>
              {vehicle?.equipment_notes ?? lead.equipment_notes}
            </div>
          )}
          {Array.isArray(vehicle?.image_urls) && vehicle.image_urls.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-2">
              {vehicle.image_urls.map((url: string, i: number) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
                  <img
                    src={url}
                    alt={`Kundbild ${i + 1}`}
                    loading="lazy"
                    className="h-16 w-16 rounded border border-border object-cover hover:opacity-80 transition-opacity"
                  />
                </a>
              ))}
            </div>
          )}
          <div className="pt-1">
            <ExternalButtons
              leadId={lead.id}
              regnr={lead.registration_number}
              vehicle={vehicle}
              carInfoPattern={settings?.car_info_url_pattern}
              blocketPattern={settings?.blocket_url_pattern}
              biluppgifterPattern={settings?.biluppgifter_url_pattern}
              onBlocketValuate={() => blocket.mutate()}
              blocketPending={blocket.isPending}
            />
          </div>
          {(blocket.isPending || blocket.data) && (
            <div className="pt-2">
              <BlocketValuationResult
                result={(blocket.data as ValuationResult) ?? null}
                isPending={blocket.isPending}
                isError={blocket.isError}
                onApply={applyBlocket}
                onRetry={() => blocket.mutate()}
              />
            </div>
          )}
        </div>

        {/* Pricing */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold">Pris</span>
          </div>
          <div className="text-sm space-y-1">
            <Line label="Kundens förväntan" value={formatExpectation(lead.customer_expectation, pricing?.customer_expectation)} />
            <Line label="Värdering" value={range(pricing?.valuation_from, pricing?.valuation_to)} />
            <Line label="Inpris" value={range(pricing?.in_price_from ?? pricing?.in_price, pricing?.in_price_to ?? pricing?.in_price)} />
            <Line label="Utpris" value={range(pricing?.out_price_from ?? pricing?.out_price, pricing?.out_price_to ?? pricing?.out_price)} />
            <Line label="Säljtid" value={lead.selling_timeframe ?? vehicle?.selling_timeframe ?? "—"} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Chip({ icon: Icon, label, tone }: { icon?: any; label: string; tone?: "urgent" }) {
  const cls =
    tone === "urgent"
      ? "bg-status-urgent/15 text-status-urgent border-status-urgent/30"
      : "bg-elevated text-foreground border-border";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border ${cls}`}>
      {Icon && <Icon className="h-3 w-3" />}
      {label}
    </span>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
