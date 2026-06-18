import type { ValuationVehicle } from "./types";

export const BLOCKET_INCOMPLETE_MESSAGE =
  "Fyll i alla obligatoriska biluppgifter för att hämta Blocket-värdering.";

export type BlocketVehicleField =
  | "brand"
  | "model"
  | "version"
  | "year"
  | "mileage_mil"
  | "fuel"
  | "gearbox"
  | "body_type"
  | "drive_type"
  | "horsepower";

export type BlocketVehicleForValidation = Omit<ValuationVehicle, "year" | "mileage_mil" | "horsepower"> & {
  year?: number | string | null;
  mileage_mil?: number | string | null;
  horsepower?: number | string | null;
};

export const BLOCKET_REQUIRED_FIELDS: { key: BlocketVehicleField; label: string }[] = [
  { key: "brand", label: "Märke" },
  { key: "model", label: "Modell" },
  { key: "version", label: "Version / utförande" },
  { key: "year", label: "Årsmodell" },
  { key: "mileage_mil", label: "Miltal" },
  { key: "fuel", label: "Drivmedel" },
  { key: "gearbox", label: "Växellåda" },
  { key: "body_type", label: "Karosstyp" },
  { key: "drive_type", label: "Drivhjul" },
  { key: "horsepower", label: "Hästkrafter" },
];

const PLACEHOLDER_VALUES = new Set([
  "",
  "-",
  "—",
  "_",
  "n/a",
  "na",
  "unknown",
  "unknown_value",
  "okänd",
  "okänt",
  "okant",
  "vet ej",
  "null",
  "undefined",
]);

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isPresentString(value: unknown): boolean {
  const s = cleanString(value).toLowerCase();
  return !!s && !PLACEHOLDER_VALUES.has(s);
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || PLACEHOLDER_VALUES.has(trimmed.toLowerCase())) return null;
    const normalized = trimmed.replace(/\s/g, "").replace(",", ".");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isValidYear(value: unknown): boolean {
  const n = toFiniteNumber(value);
  const currentYear = new Date().getFullYear();
  return n != null && Number.isInteger(n) && n >= 1950 && n <= currentYear + 1;
}

function isPositiveNumber(value: unknown): boolean {
  const n = toFiniteNumber(value);
  return n != null && n > 0;
}

export function getMissingBlocketVehicleFields(
  vehicle: BlocketVehicleForValidation | null | undefined,
): string[] {
  const v: Partial<BlocketVehicleForValidation> = vehicle ?? {};
  const missing: string[] = [];

  if (!isPresentString(v.brand)) missing.push("Märke");
  if (!isPresentString(v.model)) missing.push("Modell");
  if (!isPresentString(v.version)) missing.push("Version / utförande");
  if (!isValidYear(v.year)) missing.push("Årsmodell");
  if (!isPositiveNumber(v.mileage_mil)) missing.push("Miltal");
  if (!isPresentString(v.fuel)) missing.push("Drivmedel");
  if (!isPresentString(v.gearbox)) missing.push("Växellåda");
  if (!isPresentString(v.body_type)) missing.push("Karosstyp");
  if (!isPresentString(v.drive_type)) missing.push("Drivhjul");
  if (!isPositiveNumber(v.horsepower)) missing.push("Hästkrafter");

  return missing;
}

export function isVehicleCompleteForBlocket(vehicle: BlocketVehicleForValidation | null | undefined): boolean {
  return getMissingBlocketVehicleFields(vehicle).length === 0;
}

export function blocketMissingFieldsText(vehicle: BlocketVehicleForValidation | null | undefined): string {
  const missing = getMissingBlocketVehicleFields(vehicle);
  if (missing.length === 0) return "";
  return `${BLOCKET_INCOMPLETE_MESSAGE} Saknas/ogiltigt: ${missing.join(", ")}.`;
}

function normalizeForKey(value: unknown): string | number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const s = value.trim();
    return s && !PLACEHOLDER_VALUES.has(s.toLowerCase()) ? s.toLowerCase() : null;
  }
  return null;
}

export function blocketVehicleFingerprint(vehicle: BlocketVehicleForValidation | null | undefined): readonly unknown[] {
  const v: Partial<BlocketVehicleForValidation> = vehicle ?? {};
  return [
    normalizeForKey(v.brand),
    normalizeForKey(v.model),
    normalizeForKey(v.version),
    normalizeForKey(v.year),
    normalizeForKey(v.mileage_mil),
    normalizeForKey(v.fuel),
    normalizeForKey(v.gearbox),
    normalizeForKey(v.body_type),
    normalizeForKey(v.drive_type),
    normalizeForKey(v.horsepower),
  ] as const;
}
