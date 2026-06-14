// Quiet-hours-helpers i Europe/Stockholm-tid.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const TZ = "Europe/Stockholm";

function getStockholmParts(d: Date): { hour: number; minute: number; year: number; month: number; day: number } {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  return {
    hour: parseInt(parts.hour, 10) % 24,
    minute: parseInt(parts.minute, 10),
    year: parseInt(parts.year, 10),
    month: parseInt(parts.month, 10),
    day: parseInt(parts.day, 10),
  };
}

interface QuietConfig {
  startHour: number; // 21
  endHour: number; // 8
}

async function loadConfig(): Promise<QuietConfig> {
  const { data } = await supabaseAdmin
    .from("company_settings")
    .select("sms_quiet_hours_start, sms_quiet_hours_end")
    .limit(1)
    .maybeSingle();
  const parseHour = (s: string | null | undefined, fallback: number) =>
    s ? parseInt(s.split(":")[0], 10) : fallback;
  return {
    startHour: parseHour(data?.sms_quiet_hours_start, 21),
    endHour: parseHour(data?.sms_quiet_hours_end, 8),
  };
}

export async function isInQuietHours(now: Date = new Date()): Promise<boolean> {
  const { startHour, endHour } = await loadConfig();
  const { hour } = getStockholmParts(now);
  // Wrapping range: start >= 21, end < 8
  if (startHour < endHour) {
    return hour >= startHour && hour < endHour;
  }
  return hour >= startHour || hour < endHour;
}

// Returnerar nästa tidpunkt utanför quiet-hours (UTC ISO).
export async function nextSendWindow(now: Date = new Date()): Promise<Date> {
  const { endHour } = await loadConfig();
  const parts = getStockholmParts(now);
  // Bygg en Date i Stockholm = endHour:00 nästa möjliga dag.
  // Enklare: lägg till timmar tills hour === endHour.
  const candidate = new Date(now.getTime());
  for (let i = 0; i < 24 * 2; i++) {
    candidate.setMinutes(0, 0, 0);
    candidate.setTime(candidate.getTime() + 60 * 60 * 1000);
    const p = getStockholmParts(candidate);
    if (p.hour === endHour) return candidate;
  }
  // Fallback: 8h fram i tiden
  return new Date(now.getTime() + 8 * 60 * 60 * 1000);
}
