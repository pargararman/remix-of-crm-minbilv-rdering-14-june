// Svenska formatteringshjälpare.
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { formatDistanceToNow, format } from "date-fns";
import { sv } from "date-fns/locale";

export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const parsed = parsePhoneNumberFromString(raw, "SE");
  return parsed?.formatInternational() ?? raw;
}

export function normalizePhoneE164(raw: string): string | null {
  const parsed = parsePhoneNumberFromString(raw, "SE");
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number; // E.164
}

/**
 * Normaliserar svenska telefonnummer till +46-format (E.164).
 * Accepterar: "07XX…", "+46…", "0046…", "46…" och mellanslag/bindestreck.
 * Returnerar null om numret inte kan tolkas som giltigt SE-nummer.
 */
export function toE164SE(input: string | null | undefined): string | null {
  if (!input) return null;
  const cleaned = String(input).replace(/[\s().\-]/g, "");
  if (!cleaned) return null;
  // libphonenumber-js hanterar 07, +46, 0046, 46 om vi anger SE som land
  return normalizePhoneE164(cleaned);
}

export function normalizeRegnr(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

const sek = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
  maximumFractionDigits: 0,
});

export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return sek.format(amount);
}

export function formatDateTime(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return format(date, "d MMM yyyy HH:mm", { locale: sv });
}

export function formatRelative(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return formatDistanceToNow(date, { addSuffix: true, locale: sv });
}

// Konverterar "1500 - 1999" eller "15000+" till heltal (mil).
export function parseMileageRange(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = s.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}
