// Operativ lead-rad / kort — sales-orienterad, inte spreadsheet.
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Clock, MessageSquare, Phone, ArrowRight, Pin, X, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ExternalLinkLogoButton } from "@/components/leads/external-link-logo-button";
import { MarkLostModal } from "@/components/leads/mark-lost-modal";
import { SmsChatPanel } from "@/components/leads/sms-chat";
import { toggleLeadPin } from "@/lib/leads.functions";
import { updateLeadStage } from "@/lib/leads-detail.functions";
import { formatRelative, formatPhone } from "@/lib/format";
import { buildCarInfoUrl, buildBlocketUrl, buildBiluppgifterUrl } from "@/lib/external-links";
import { STAGE_GROUPS, STAGE_TONE_CLASS, dbStageToGroup } from "@/lib/stage-groups";
import type { LeadStage } from "@/lib/leads.functions";

// Stage-sekvens som speglar dashboardens grupper (samma som StagePicker).
const STAGE_MOVE_OPTIONS: { value: LeadStage; label: string; confirm?: boolean }[] = [
  { value: "ny_lead", label: "Behöver värderas" },
  { value: "kontaktad", label: "Kontakt 1" },
  { value: "uppfoljning_1", label: "Kontakt 2" },
  { value: "uppfoljning_2", label: "Kontakt 3" },
  { value: "inget_svar", label: "Inget svar" },
  { value: "matchad", label: "Godkända prisförslag" },
  { value: "bud_mottaget", label: "Publicerad till handlare" },
  { value: "kund_accepterat", label: "Aktiv affär" },
  { value: "vunnen", label: "Vunnen affär", confirm: true },
  { value: "forlorad", label: "Förlorad", confirm: true },
  { value: "arkiverad", label: "Arkiv", confirm: true },
];

interface Props {
  lead: any;
  unread: number;
  carInfoPattern?: string | null;
  blocketPattern?: string | null;
  biluppgifterPattern?: string | null;
}

function useWaitingBadge(createdAt: string | null | undefined) {
  if (!createdAt) return { hours: 0, label: "0t", isOverdue: false };
  const hours = Math.floor((Date.now() - new Date(createdAt).getTime()) / 3600000);
  const label = `${hours}t`;
  const isOverdue = hours > 24;
  return { hours, label, isOverdue };
}

export function LeadCard({ lead, unread, carInfoPattern, blocketPattern, biluppgifterPattern }: Props) {
  const [smsOpen, setSmsOpen] = useState(false);
  const [markLostOpen, setMarkLostOpen] = useState(false);
  const [pendingStage, setPendingStage] = useState<{ value: LeadStage; label: string } | null>(null);
  const [savingStage, setSavingStage] = useState(false);
  const qc = useQueryClient();
  const togglePin = useServerFn(toggleLeadPin);
  const updateStage = useServerFn(updateLeadStage);
  const pinned = !!lead.is_pinned;
  const v = lead.vehicle;
  const p = lead.pricing;
  const kr = (n: number | null | undefined) => (n == null ? "—" : `${n.toLocaleString("sv-SE")} kr`);
  const carInfoUrl = buildCarInfoUrl(lead.registration_number, carInfoPattern);
  const biluppgifterUrl = buildBiluppgifterUrl(lead.registration_number, biluppgifterPattern);
  const blocketUrl = buildBlocketUrl(v, blocketPattern);
  const group = dbStageToGroup(lead.stage as LeadStage, !!lead.archived_at);
  const groupMeta = STAGE_GROUPS.find((g) => g.key === group);

  const hasUnread = unread > 0;

  async function handleTogglePin() {
    try {
      await togglePin({ data: { leadId: lead.id } });
      qc.invalidateQueries({ queryKey: ["leads"] });
    } catch (e) {
      console.error("Toggle pin failed", e);
    }
  }

  async function commitStage(target: LeadStage) {
    setSavingStage(true);
    try {
      await updateStage({ data: { leadId: lead.id, stage: target } });
      toast.success("Steg uppdaterat");
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["stage-group-counts"] });
      qc.invalidateQueries({ queryKey: ["stage-counts"] });
      qc.invalidateQueries({ queryKey: ["lead-detail", lead.id] });
    } catch (e: any) {
      toast.error(e?.message ?? "Kunde inte uppdatera steg");
    } finally {
      setSavingStage(false);
      setPendingStage(null);
    }
  }

  function onPickStage(opt: { value: LeadStage; label: string; confirm?: boolean }) {
    if (opt.value === lead.stage) return;
    if (opt.confirm) setPendingStage(opt);
    else void commitStage(opt.value);
  }

  const valuation =
    p?.valuation_from != null || p?.valuation_to != null
      ? `${(p.valuation_from ?? 0).toLocaleString("sv-SE")}–${(p.valuation_to ?? 0).toLocaleString("sv-SE")} kr`
      : null;

  const waiting = useWaitingBadge(lead.created_at);

  const cardOverdueClass = waiting?.isOverdue ? "ring-1 ring-red-500/40 shadow-[0_0_8px_rgba(239,68,68,0.15)]" : "";

  return (
    <>
      <div
        className={`group relative border-b border-border last:border-b-0 px-3 sm:px-4 py-3 hover:bg-elevated transition ${
          hasUnread ? "bg-status-urgent/5" : ""
        } ${pinned ? "bg-primary/5" : ""} ${cardOverdueClass}`}
      >
        {hasUnread && (
          <span className="absolute left-0 top-0 bottom-0 w-1 bg-status-urgent" aria-hidden />
        )}
        <div className="flex items-start gap-3">
          {/* Vänsterkolumn: regnr + bil */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/leads/$leadId"
                params={{ leadId: lead.id }}
                className="font-mono text-sm font-bold tracking-wider hover:underline"
              >
                {lead.registration_number}
              </Link>
              {pinned && <Pin className="h-3 w-3 text-primary fill-primary" aria-label="Pinnad" />}
              {groupMeta && (() => {
                const navOptions = STAGE_MOVE_OPTIONS.filter((o) => o.value !== "forlorad");
                const currentIdx = navOptions.findIndex((o) => o.value === lead.stage);
                const prevOpt = currentIdx > 0 ? navOptions[currentIdx - 1] : null;
                const nextOpt = currentIdx >= 0 && currentIdx < navOptions.length - 1 ? navOptions[currentIdx + 1] : null;
                return (
                  <div className="inline-flex items-center gap-0.5">
                    <button
                      type="button"
                      disabled={savingStage || !prevOpt}
                      onClick={() => prevOpt && onPickStage(prevOpt)}
                      className="p-0.5 rounded hover:bg-muted text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                      title={prevOpt ? `Flytta till "${prevOpt.label}"` : "Inget tidigare steg"}
                      aria-label="Flytta ett steg bakåt"
                    >
                      <ChevronLeft className="h-3 w-3" />
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        disabled={savingStage}
                        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium border transition hover:opacity-80 focus:outline-none focus:ring-1 focus:ring-ring ${STAGE_TONE_CLASS[groupMeta.tone]} ${savingStage ? "opacity-50" : ""}`}
                        title="Flytta steg"
                      >
                        {groupMeta.label}
                        <ChevronDown className="h-2.5 w-2.5" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-56">
                        {STAGE_MOVE_OPTIONS.filter((o) => o.value !== "forlorad").map((opt) => (
                          <DropdownMenuItem
                            key={opt.value}
                            disabled={opt.value === lead.stage}
                            onClick={() => onPickStage(opt)}
                          >
                            {opt.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <button
                      type="button"
                      disabled={savingStage || !nextOpt}
                      onClick={() => nextOpt && onPickStage(nextOpt)}
                      className="p-0.5 rounded hover:bg-muted text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                      title={nextOpt ? `Flytta till "${nextOpt.label}"` : "Inget nästa steg"}
                      aria-label="Flytta ett steg framåt"
                    >
                      <ChevronRight className="h-3 w-3" />
                    </button>
                  </div>
                );
              })()}
              {waiting && (
                <span
                  className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                    waiting.isOverdue
                      ? "bg-red-500/10 text-red-600 border-red-500/30"
                      : "bg-muted text-muted-foreground border-muted-foreground/20"
                  }`}
                  title={`Väntetid sedan skapad: ${waiting.label}`}
                >
                  <Clock className="h-2.5 w-2.5" />
                  {waiting.label}
                </span>
              )}
              {hasUnread && (
                <Badge variant="destructive" className="h-4 px-1.5 text-[10px] animate-pulse">
                  <MessageSquare className="h-2.5 w-2.5 mr-0.5" />
                  {unread} olästa
                </Badge>
              )}
              {(lead.submission_count ?? 1) > 1 && (
                <Badge variant="outline" className="h-4 px-1.5 text-[10px] border-amber-400 text-amber-900 bg-amber-50">
                  Återkomst ×{lead.submission_count}
                </Badge>
              )}
              <span className="text-[11px] text-muted-foreground ml-auto whitespace-nowrap">
                {formatRelative(lead.created_at)}
              </span>
            </div>
            <div className="mt-1 text-sm text-foreground truncate">
              {v ? (
                <>
                  <span className="font-medium">{[v.brand, v.model].filter(Boolean).join(" ") || "—"}</span>
                  {v.year && <span className="text-muted-foreground"> · {v.year}</span>}
                  {v.mileage_mil != null && (
                    <span className="text-muted-foreground"> · {v.mileage_mil.toLocaleString("sv-SE")} mil</span>
                  )}
                  {v.fuel && <span className="text-muted-foreground"> · {fuelLabel(v.fuel)}</span>}
                  {v.gearbox && <span className="text-muted-foreground"> · {gearLabel(v.gearbox)}</span>}
                </>
              ) : (
                <span className="text-muted-foreground">Ingen bilinfo</span>
              )}
            </div>
            <div className="mt-1 text-xs text-muted-foreground flex flex-wrap gap-x-2">
              <span className="font-medium text-foreground">{lead.customer_name ?? "—"}</span>
              {lead.phone && <span className="tabular-nums">{formatPhone(lead.phone)}</span>}
              {lead.city && <span>· {lead.city}</span>}
            </div>
            {(valuation || p?.customer_expectation != null) && (
              <div className="mt-1 text-xs flex flex-wrap gap-x-3 tabular-nums">
                {valuation && (
                  <span>
                    <span className="text-muted-foreground">Värd:</span> {valuation}
                  </span>
                )}
                {p?.customer_expectation != null && (
                  <span>
                    <span className="text-muted-foreground">Kund:</span> {kr(p.customer_expectation)}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Action-rad */}
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <Button size="sm" variant="default" className="h-7 text-xs px-2" onClick={() => setSmsOpen(true)}>
            <MessageSquare className="h-3.5 w-3.5 mr-1" /> SMS
          </Button>
          {lead.phone && (
            <Button asChild size="sm" variant="outline" className="h-7 text-xs px-2">
              <a href={`tel:${lead.phone}`}>
                <Phone className="h-3.5 w-3.5 mr-1" /> Ring
              </a>
            </Button>
          )}
          {carInfoUrl && <ExternalLinkLogoButton type="car_info" href={carInfoUrl} />}
          {biluppgifterUrl && <ExternalLinkLogoButton type="biluppgifter" href={biluppgifterUrl} />}
          {blocketUrl && <ExternalLinkLogoButton type="blocket" href={blocketUrl} />}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs px-2 text-muted-foreground hover:text-destructive ml-auto"
            onClick={() => setMarkLostOpen(true)}
          >
            <X className="h-3.5 w-3.5 mr-1" /> Förlorad
          </Button>
          <Button asChild size="sm" variant="ghost" className="h-7 text-xs px-2">
            <Link to="/leads/$leadId" params={{ leadId: lead.id }}>
              Öppna <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Link>
          </Button>
        </div>

        {/* Hover-actions: pinna */}
        <div className="absolute top-2 right-2 flex items-center gap-0.5">
          <button
            type="button"
            onClick={handleTogglePin}
            className={`p-1 rounded transition-opacity hover:bg-primary/10 ${
              pinned
                ? "text-primary opacity-100"
                : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-primary"
            }`}
            title={pinned ? "Avpinna" : "Pinna högst upp"}
          >
            <Pin className={`h-3.5 w-3.5 ${pinned ? "fill-primary" : ""}`} />
          </button>
        </div>
      </div>

      <MarkLostModal
        leadId={lead.id}
        open={markLostOpen}
        onOpenChange={setMarkLostOpen}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ["leads"] });
          qc.invalidateQueries({ queryKey: ["stage-group-counts"] });
        }}
      />

      <AlertDialog open={!!pendingStage} onOpenChange={(o) => !o && setPendingStage(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Flytta lead till "{pendingStage?.label}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Detta är en manuell stegförflyttning som loggas i tidslinjen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingStage && commitStage(pendingStage.value)}>
              Bekräfta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SmsChatPanel
        leadId={lead.id}
        customerName={lead.customer_name}
        phone={lead.phone}
        open={smsOpen}
        onOpenChange={setSmsOpen}
      />
    </>
  );
}

function fuelLabel(f: string): string {
  const m: Record<string, string> = {
    bensin: "Bensin", diesel: "Diesel", el: "El", electric: "El",
    hybrid: "Hybrid", plugin_hybrid: "Laddhybrid", gas: "Gas", ethanol: "Etanol",
    hybrid_bensin: "Hybrid (b)", hybrid_diesel: "Hybrid (d)",
    plugin_bensin: "Laddhybrid (b)", plugin_diesel: "Laddhybrid (d)",
  };
  return m[f] ?? f;
}

function gearLabel(g: string): string {
  return g === "manual" ? "Manuell" : g === "automatic" ? "Aut." : g;
}
