// Blocket "make" filter IDs (decimal brand codes used by the mobility search API).
//
// The Blocket car-search endpoint filters by brand using a numeric "make" code
// (e.g. Volvo = "0.818"), NOT the human brand name. These were reverse-engineered
// from blocket.se search URLs and the dunderrrrrr/blocket_api reference repo.
//
// Only brands we have verified a code for are listed. Unknown brand -> null, and
// the provider falls back to free-text search via the `q` parameter.

export const BLOCKET_MAKE_ID: Record<string, string> = {
  Audi: "0.795",
  BMW: "0.799",
  Citroen: "0.803",
  Ford: "0.806",
  Honda: "0.808",
  Hyundai: "0.809",
  Kia: "0.811",
  "Mercedes-Benz": "0.815",
  Nissan: "0.816",
  Opel: "0.817",
  Peugeot: "0.819", // note: shares ordering quirks; verify against live before heavy use
  Renault: "0.820",
  Saab: "0.821",
  Skoda: "0.822",
  Toyota: "0.813",
  Volkswagen: "0.824",
  Volvo: "0.818",
};

/**
 * Returns the Blocket numeric "make" filter id for a brand, or null if we don't
 * have a verified code (caller should then rely on free-text `q`).
 *
 * Matching is case-insensitive and tolerant of extra whitespace.
 */
export function blocketMakeId(brand: string | null | undefined): string | null {
  if (!brand) return null;
  const needle = brand.trim().toLowerCase();
  for (const [name, id] of Object.entries(BLOCKET_MAKE_ID)) {
    if (name.toLowerCase() === needle) return id;
  }
  return null;
}
