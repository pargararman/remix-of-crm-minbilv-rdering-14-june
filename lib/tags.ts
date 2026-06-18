// Predefinerade tagg-konstanter med svensk label + färgklass.
export const TAGS = [
  { value: "het_lead", label: "Het lead", color: "bg-red-500/15 text-red-400 border-red-500/30" },
  { value: "vill_salja_snabbt", label: "Vill sälja snabbt", color: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  { value: "serios_saljare", label: "Seriös säljare", color: "bg-green-500/15 text-green-400 border-green-500/30" },
  { value: "svarforhandlad", label: "Svårförhandlad", color: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
  { value: "priskanslig", label: "Priskänslig", color: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  { value: "behover_foljas_upp", label: "Behöver följas upp", color: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  { value: "handlarfavorit", label: "Handlarfavorit", color: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
  { value: "osaker_kund", label: "Osäker kund", color: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
  { value: "ej_serios", label: "Ej seriös", color: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
] as const;

export type TagValue = (typeof TAGS)[number]["value"];
export const TAG_VALUES = TAGS.map((t) => t.value) as readonly TagValue[];
export const TAG_LABEL: Record<string, string> = Object.fromEntries(TAGS.map((t) => [t.value, t.label]));
export const TAG_COLOR: Record<string, string> = Object.fromEntries(TAGS.map((t) => [t.value, t.color]));
