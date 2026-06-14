import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Calendar as CalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listCalendarEvents } from "@/lib/tasks.functions";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/kalender")({
  head: () => ({ meta: [{ title: "Kalender — Min Bil Värdering" }] }),
  component: KalenderPage,
});

type View = "dag" | "vecka" | "lista";

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function startOfWeek(d: Date) {
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7; // måndag = 0
  return addDays(x, -day);
}

const KIND_LABEL: Record<string, string> = { task: "Task", callback: "Återuppringning", sms: "SMS" };
const KIND_COLOR: Record<string, string> = {
  task: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  callback: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  sms: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

function KalenderPage() {
  const fetchFn = useServerFn(listCalendarEvents);
  const [view, setView] = useState<View>("vecka");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));

  const { from, to } = useMemo(() => {
    if (view === "dag") return { from: anchor, to: addDays(anchor, 1) };
    if (view === "vecka") {
      const s = startOfWeek(anchor);
      return { from: s, to: addDays(s, 7) };
    }
    return { from: anchor, to: addDays(anchor, 30) };
  }, [view, anchor]);

  const q = useQuery({
    queryKey: ["calendar", view, from.toISOString()],
    queryFn: () => fetchFn({ data: { from: from.toISOString(), to: to.toISOString() } }),
  });

  const events = q.data?.events ?? [];

  const shift = (n: number) => setAnchor(view === "dag" ? addDays(anchor, n) : view === "vecka" ? addDays(anchor, 7 * n) : addDays(anchor, 30 * n));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <CalIcon className="h-5 w-5" />
        <h1 className="text-xl font-semibold">Kalender</h1>
        <div className="flex-1" />
        <div className="flex gap-1">
          {(["dag","vecka","lista"] as View[]).map((v) => (
            <Button key={v} size="sm" variant={view === v ? "default" : "outline"} onClick={() => setView(v)}>
              {v === "dag" ? "Dag" : v === "vecka" ? "Vecka" : "Lista"}
            </Button>
          ))}
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => shift(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button size="sm" variant="ghost" onClick={() => setAnchor(startOfDay(new Date()))}>Idag</Button>
          <Button size="sm" variant="ghost" onClick={() => shift(1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {from.toLocaleDateString("sv-SE")} – {addDays(to, -1).toLocaleDateString("sv-SE")}
      </p>

      {view === "vecka" ? (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
          {Array.from({ length: 7 }).map((_, i) => {
            const day = addDays(from, i);
            const dayEvents = events.filter((e: any) => {
              const d = new Date(e.when);
              return d >= day && d < addDays(day, 1);
            });
            return (
              <Card key={i}>
                <CardContent className="p-2 space-y-2 min-h-32">
                  <div className="text-xs font-semibold">
                    {day.toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short" })}
                  </div>
                  {dayEvents.length === 0 && <div className="text-xs text-muted-foreground">—</div>}
                  {dayEvents.map((e: any) => <EventChip key={`${e.kind}-${e.id}`} ev={e} />)}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="p-3 space-y-2">
            {q.isLoading && <p className="text-sm text-muted-foreground">Laddar…</p>}
            {!q.isLoading && events.length === 0 && <p className="text-sm text-muted-foreground">Inga händelser i perioden.</p>}
            {events.map((e: any) => (
              <div key={`${e.kind}-${e.id}`} className="flex items-center gap-3 p-2 rounded hover:bg-muted/40">
                <Badge variant="outline" className={KIND_COLOR[e.kind]}>{KIND_LABEL[e.kind]}</Badge>
                <div className="text-xs text-muted-foreground w-40 shrink-0">{formatDateTime(e.when)}</div>
                <Link to="/leads/$leadId" params={{ leadId: e.lead_id }} className="text-sm hover:underline flex-1 truncate">
                  {e.title} {e.lead && <span className="text-muted-foreground">· {e.lead.customer_name ?? e.lead.registration_number}</span>}
                </Link>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function EventChip({ ev }: { ev: any }) {
  return (
    <Link to="/leads/$leadId" params={{ leadId: ev.lead_id }} className={`block text-xs p-1.5 rounded border ${KIND_COLOR[ev.kind]} hover:opacity-80`}>
      <div className="font-mono">{new Date(ev.when).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}</div>
      <div className="truncate">{ev.title}</div>
      {ev.lead && <div className="truncate opacity-70">{ev.lead.customer_name ?? ev.lead.registration_number}</div>}
    </Link>
  );
}
