export function fmtKr(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${n.toLocaleString("sv-SE")} kr`;
}

export function formatRelativeClose(closesAt: string | null, endedAt: string | null): string {
  if (endedAt) return "Auktionen avslutad";
  if (!closesAt) return "—";
  const diff = new Date(closesAt).getTime() - Date.now();
  if (diff <= 0) return "Stänger nu";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `Stänger om ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Stänger om ${hours} tim ${mins % 60} min`;
  return `Stänger ${new Date(closesAt).toLocaleString("sv-SE")}`;
}

export function formatCountdown(closesAt: string | null): string {
  if (!closesAt) return "—";
  const diff = new Date(closesAt).getTime() - Date.now();
  if (diff <= 0) return "00:00:00";
  const s = Math.floor(diff / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function formatHm(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
}
