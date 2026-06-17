// Mappning från presentations-grupp → DB-stages.
// UI visar 11 användarvänliga grupper, DB har fler granulära enums.
import type { LeadStage } from "@/lib/leads.functions";

export type StageGroup =
  | "behover_varderas"
  | "kontakt_1"
  | "kontakt_2"
  | "kontakt_3"
  | "inget_svar"
  | "godkand_pris"
  | "publicerad"
  | "aktiv_affar"
  | "vunnen"
  | "forlorad"
  | "arkiv";

export const STAGE_GROUP_TO_DB: Record<StageGroup, LeadStage[]> = {
  behover_varderas: ["ny_lead", "snabb_vardering"],
  kontakt_1: ["kontaktad"],
  kontakt_2: ["uppfoljning_1"],
  kontakt_3: ["uppfoljning_2", "uppfoljning_3"],
  inget_svar: ["inget_svar"],
  godkand_pris: ["matchad"],
  publicerad: [], // särfall — leads med rader i lead_dealer_publications
  aktiv_affar: ["bud_mottaget", "kund_accepterat", "kontrakt_pagar_avtal", "hamtning"],
  vunnen: ["vunnen"],
  forlorad: ["forlorad"],
  arkiv: ["arkiverad"],
};

export const STAGE_GROUPS: { key: StageGroup; label: string; tone: StageTone }[] = [
  { key: "behover_varderas", label: "Behöver värderas", tone: "urgent" },
  { key: "kontakt_1", label: "Kontakt 1", tone: "active" },
  { key: "kontakt_2", label: "Kontakt 2", tone: "followup" },
  { key: "kontakt_3", label: "Kontakt 3", tone: "followup" },
  { key: "inget_svar", label: "Inget svar", tone: "inactive" },
  { key: "godkand_pris", label: "Godkända prisförslag", tone: "active" },
  { key: "publicerad", label: "Publicerad till handlare", tone: "dealer" },
  { key: "aktiv_affar", label: "Aktiv affär", tone: "dealer" },
  { key: "vunnen", label: "Vunnen affär", tone: "won" },
  { key: "forlorad", label: "Förlorad", tone: "inactive" },
  { key: "arkiv", label: "Arkiv", tone: "inactive" },
];

export type StageTone = "urgent" | "followup" | "active" | "dealer" | "won" | "inactive";

export const STAGE_TONE_CLASS: Record<StageTone, string> = {
  urgent: "bg-status-urgent/15 text-status-urgent border-status-urgent/30",
  followup: "bg-status-followup/15 text-status-followup border-status-followup/30",
  active: "bg-status-active/15 text-status-active border-status-active/30",
  dealer: "bg-status-dealer/15 text-status-dealer border-status-dealer/30",
  won: "bg-status-won/15 text-status-won border-status-won/30",
  inactive: "bg-status-inactive/15 text-status-inactive border-status-inactive/30",
};

// Vilken grupp visas ett givet DB-stage i på dashboarden?
export function dbStageToGroup(stage: LeadStage, isArchived: boolean): StageGroup {
  if (isArchived) return "arkiv";
  for (const [group, stages] of Object.entries(STAGE_GROUP_TO_DB) as [StageGroup, LeadStage[]][]) {
    if (stages.includes(stage)) return group;
  }
  return "behover_varderas";
}

// Underliggande detalj-stages för "Aktiv affär"-checklistan.
export const ACTIVE_DEAL_STEPS: { stage: LeadStage; label: string }[] = [
  { stage: "bud_mottaget", label: "Bud mottaget" },
  { stage: "kund_accepterat", label: "Kund kontaktad & accepterat" },
  { stage: "kontrakt_pagar_avtal", label: "Bud accepterat / kontrakt" },
  { stage: "hamtning", label: "Hämtning bokad" },
];
