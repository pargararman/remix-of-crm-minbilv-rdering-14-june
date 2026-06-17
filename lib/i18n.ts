// Enkel svensk i18n-katalog. Använd t("key") för översättning.
// Faller tillbaka till nyckeln om översättning saknas.

export const sv = {
  // Allmänt
  "common.save": "Spara",
  "common.cancel": "Avbryt",
  "common.delete": "Ta bort",
  "common.edit": "Redigera",
  "common.close": "Stäng",
  "common.confirm": "Bekräfta",
  "common.loading": "Laddar…",
  "common.error": "Ett fel uppstod",
  "common.success": "Klart",
  "common.search": "Sök",
  "common.filter": "Filtrera",
  "common.export": "Exportera",
  "common.import": "Importera",
  "common.back": "Tillbaka",
  "common.next": "Nästa",
  "common.previous": "Föregående",
  "common.yes": "Ja",
  "common.no": "Nej",
  "common.empty": "Inget att visa",

  // Leads / stages
  "stage.ny_lead": "Nytt lead",
  "stage.snabb_vardering": "Snabbvärdering",
  "stage.uppfoljning_1": "Uppföljning 1",
  "stage.uppfoljning_2": "Uppföljning 2",
  "stage.uppfoljning_3": "Uppföljning 3",
  "stage.forhandling": "Förhandling",
  "stage.vunnen": "Vunnen",
  "stage.forlorad": "Förlorad",
  "stage.arkiverad": "Arkiverad",
  "stage.inget_svar": "Inget svar",

  // Navigation
  "nav.dashboard": "Dashboard",
  "nav.calendar": "Kalender",
  "nav.reports": "Rapporter",
  "nav.dealers": "Handlare",
  "nav.billing": "Fakturering",
  "nav.exports": "Exporter",
  "nav.audit": "Audit-logg",
  "nav.gdpr": "GDPR",
  "nav.security": "Säkerhet",
  "nav.settings": "Inställningar",
  "nav.logout": "Logga ut",

  // GDPR
  "gdpr.access": "Dataåtkomst",
  "gdpr.deletion": "Radering",
  "gdpr.rectification": "Rättelse",
  "gdpr.pending": "Väntar",
  "gdpr.processing": "Bearbetas",
  "gdpr.completed": "Slutförd",

  // Notiser
  "notif.unread": "olästa",
  "notif.all_read": "Alla lästa",
  "notif.empty": "Inga notiser",
} as const;

export type TranslationKey = keyof typeof sv;

export function t(key: TranslationKey | string, fallback?: string): string {
  return (sv as Record<string, string>)[key] ?? fallback ?? key;
}

export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just nu";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min sedan`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} tim sedan`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days} dagar sedan`;
  return d.toLocaleDateString("sv-SE");
}
