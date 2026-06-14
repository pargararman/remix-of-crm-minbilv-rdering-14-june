// Deklarativ dokumentation av stadier, manuella övergångar och automatiska regler.
// Hålls i synk manuellt med src/lib/automation/stage-rules.server.ts.

export type StageKey =
  | "ny_lead"
  | "snabb_vardering"
  | "kontaktad"
  | "uppfoljning_1"
  | "uppfoljning_2"
  | "uppfoljning_3"
  | "inget_svar"
  | "matchad"
  | "bud_mottaget"
  | "kund_accepterat"
  | "kontrakt_pagar_avtal"
  | "hamtning"
  | "vunnen"
  | "forlorad"
  | "arkiverad";

export const STAGE_LABELS: Record<StageKey, string> = {
  ny_lead: "Ny lead",
  snabb_vardering: "Behöver värderas",
  kontaktad: "Kontaktad / Bud skickats",
  uppfoljning_1: "Uppföljning 1",
  uppfoljning_2: "Uppföljning 2",
  uppfoljning_3: "Uppföljning 3",
  inget_svar: "Inget svar",
  matchad: "Matchad med handlare",
  bud_mottaget: "Bud mottaget",
  kund_accepterat: "Kund accepterat",
  kontrakt_pagar_avtal: "Kontrakt pågår",
  hamtning: "Hämtning",
  vunnen: "Vunnen affär",
  forlorad: "Förlorad",
  arkiverad: "Arkiverad",
};

// Tillåtna manuella övergångar — DETTA ÄR KÄLLAN till övergångsmatrisen.
// stage-rules.server.ts importerar denna tabell; håll den INTE i synk
// manuellt längre, det finns bara en kopia.
export const MANUAL_TRANSITIONS: Record<StageKey, StageKey[]> = {
  ny_lead: ["snabb_vardering", "kontaktad", "inget_svar", "matchad", "arkiverad", "forlorad"],
  snabb_vardering: ["kontaktad", "inget_svar", "matchad", "arkiverad", "forlorad"],
  kontaktad: ["uppfoljning_1", "inget_svar", "matchad", "bud_mottaget", "kund_accepterat", "forlorad", "arkiverad"],
  uppfoljning_1: ["kontaktad", "uppfoljning_2", "inget_svar", "matchad", "forlorad", "arkiverad"],
  uppfoljning_2: ["kontaktad", "uppfoljning_3", "inget_svar", "matchad", "forlorad", "arkiverad"],
  uppfoljning_3: ["kontaktad", "inget_svar", "matchad", "forlorad", "arkiverad"],
  inget_svar: ["kontaktad", "matchad", "forlorad", "arkiverad"],
  // kund_accepterat tillåts härifrån eftersom stegväljaren erbjuder hoppet
  // matchad → "Aktiv affär" när säljaren gör upp direkt utan budrunda.
  matchad: ["bud_mottaget", "kund_accepterat", "kontaktad", "forlorad", "arkiverad"],
  bud_mottaget: ["kund_accepterat", "kontrakt_pagar_avtal", "matchad", "kontaktad", "forlorad", "arkiverad"],
  kund_accepterat: ["kontrakt_pagar_avtal", "hamtning", "vunnen", "forlorad", "arkiverad"],
  kontrakt_pagar_avtal: ["hamtning", "vunnen", "forlorad", "arkiverad"],
  hamtning: ["vunnen", "forlorad", "arkiverad"],
  vunnen: ["arkiverad"],
  forlorad: ["arkiverad", "kontaktad"],
  arkiverad: [],
};

export interface AutoRule {
  id: string;
  trigger: string; // mänsklig beskrivning
  affectsFrom: StageKey[];
  movesTo: StageKey;
  sideEffect?: string;
}

// Automatisk STEGFÖRFLYTTNING är avstängd (applyStageRule är en no-op) —
// stegen ändras endast manuellt av säljare/admin. Det som ÄR automatiskt:
// uppföljnings-SMS-sekvensen (schemaläggs vid intag, avbryts vid kundsvar
// eller när leadet lämnar kontaktfasen) samt auktionstid vid matchad.
// Konfigureras under Admin → Uppföljnings-SMS.
export const AUTO_RULES: AutoRule[] = [
  {
    id: "auto_followup_sms",
    trigger:
      "Nytt lead via intaget — uppföljnings-SMS 1–3 köas enligt tiderna i Admin → Uppföljnings-SMS",
    affectsFrom: ["ny_lead", "snabb_vardering", "kontaktad", "uppfoljning_1", "uppfoljning_2", "uppfoljning_3"],
    movesTo: "kontaktad",
    sideEffect:
      "SMS:en avbryts automatiskt om kunden svarar eller om leadet publiceras, vinns, förloras eller arkiveras",
  },
  {
    id: "auto_sms_inbound_cancel",
    trigger: "Kunden svarar med inkommande SMS",
    affectsFrom: [
      "ny_lead",
      "snabb_vardering",
      "uppfoljning_1",
      "uppfoljning_2",
      "uppfoljning_3",
      "inget_svar",
    ],
    movesTo: "kontaktad",
    sideEffect: "Avbryter alla köade uppföljnings-SMS för leadet",
  },
  {
    id: "auto_auction_close",
    trigger: "Leadet når Godkänt pris (matchad)",
    affectsFrom: ["matchad"],
    movesTo: "matchad",
    sideEffect: "Auktionens stängningstid sätts till nästa vardagsstängning 17:00 (DB-trigger)",
  },
];

export const STAGE_ORDER: StageKey[] = [
  "ny_lead",
  "snabb_vardering",
  "kontaktad",
  "uppfoljning_1",
  "uppfoljning_2",
  "uppfoljning_3",
  "inget_svar",
  "matchad",
  "bud_mottaget",
  "kund_accepterat",
  "kontrakt_pagar_avtal",
  "hamtning",
  "vunnen",
  "forlorad",
  "arkiverad",
];

export function autoRulesForStage(stage: StageKey): AutoRule[] {
  return AUTO_RULES.filter((r) => r.affectsFrom.includes(stage));
}
