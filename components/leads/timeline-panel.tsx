// Full activity timeline panel with filter chips and event-type icons.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  UserPlus, UserCheck, RefreshCcw, ArrowRight, MessageCircle, MessageSquare, XCircle,
  Phone, FileText, Edit, Trash2, Tag, TagsIcon, DollarSign, Car, TrendingUp,
  Image as ImageIcon, Eye, Plus, CheckCircle, Clock, Archive, ArchiveRestore, Hand,
} from "lucide-react";
import { listTimeline } from "@/lib/timeline.functions";
import { formatDateTime } from "@/lib/format";

const EVENT_META: Record<string, { icon: any; color: string }> = {
  lead_created: { icon: UserPlus, color: "text-muted-foreground" },
  lead_assigned: { icon: UserCheck, color: "text-muted-foreground" },
  lead_claimed: { icon: Hand, color: "text-muted-foreground" },
  lead_reassigned: { icon: RefreshCcw, color: "text-muted-foreground" },
  stage_changed: { icon: ArrowRight, color: "text-violet-400" },
  auto_sms_sent: { icon: MessageCircle, color: "text-blue-400" },
  sms_sent: { icon: MessageSquare, color: "text-blue-400" },
  sms_received: { icon: MessageSquare, color: "text-green-400" },
  sms_failed: { icon: XCircle, color: "text-destructive" },
  call_logged: { icon: Phone, color: "text-blue-400" },
  note_added: { icon: FileText, color: "text-muted-foreground" },
  note_edited: { icon: Edit, color: "text-muted-foreground" },
  note_deleted: { icon: Trash2, color: "text-muted-foreground" },
  tag_added: { icon: Tag, color: "text-violet-400" },
  tag_removed: { icon: TagsIcon, color: "text-violet-400" },
  price_updated: { icon: DollarSign, color: "text-orange-400" },
  vehicle_assessment_updated: { icon: Car, color: "text-muted-foreground" },
  negotiation_entry_added: { icon: TrendingUp, color: "text-purple-400" },
  file_uploaded: { icon: ImageIcon, color: "text-muted-foreground" },
  file_deleted: { icon: Trash2, color: "text-muted-foreground" },
  file_visibility_changed: { icon: Eye, color: "text-muted-foreground" },
  task_created: { icon: Plus, color: "text-muted-foreground" },
  task_completed: { icon: CheckCircle, color: "text-green-400" },
  task_snoozed: { icon: Clock, color: "text-muted-foreground" },
  lead_archived: { icon: Archive, color: "text-muted-foreground" },
  lead_restored: { icon: ArchiveRestore, color: "text-muted-foreground" },
  lost_marked: { icon: XCircle, color: "text-muted-foreground" },
};

const FILTERS = [
  { id: "all", label: "Alla" },
  { id: "seller", label: "Säljare" },
  { id: "customer", label: "Kund" },
  { id: "system", label: "System" },
  { id: "price", label: "Pris" },
] as const;

function filterEvent(ev: any, filter: string): boolean {
  if (filter === "all") return true;
  if (filter === "price") return ev.type === "price_updated";
  if (filter === "system") return ev.actor_type === "system";
  if (filter === "seller") return ev.actor_type === "seller";
  if (filter === "customer") return ev.type === "sms_received" || ev.actor_type === "customer";
  return true;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date(); today.setHours(0,0,0,0);
  const yest = new Date(today); yest.setDate(yest.getDate() - 1);
  const dDay = new Date(d); dDay.setHours(0,0,0,0);
  if (dDay.getTime() === today.getTime()) return "Idag";
  if (dDay.getTime() === yest.getTime()) return "Igår";
  return d.toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "numeric" });
}

export function TimelinePanel({ leadId }: { leadId: string }) {
  const listFn = useServerFn(listTimeline);
  const [filter, setFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const q = useQuery({
    queryKey: ["timeline", leadId],
    queryFn: () => listFn({ data: { leadId } }),
  });

  const events = (q.data?.events ?? []).filter((e: any) => filterEvent(e, filter));
  const groups: Record<string, any[]> = {};
  for (const e of events) {
    const k = dayLabel(e.created_at);
    (groups[k] ??= []).push(e);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`text-xs px-3 py-1 rounded-full border ${filter === f.id ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {Object.entries(groups).map(([day, evs]) => (
        <div key={day}>
          <div className="text-xs font-semibold text-muted-foreground mb-2">{day}</div>
          <div className="space-y-1">
            {evs.map((e: any) => {
              const meta = EVENT_META[e.type] ?? { icon: ArrowRight, color: "text-muted-foreground" };
              const Icon = meta.icon;
              const isExp = expanded.has(e.id);
              return (
                <button
                  key={e.id}
                  className="w-full flex items-start gap-3 text-left p-2 rounded hover:bg-muted/30"
                  onClick={() => {
                    const next = new Set(expanded);
                    if (next.has(e.id)) next.delete(e.id); else next.add(e.id);
                    setExpanded(next);
                  }}
                >
                  <Icon className={`h-4 w-4 mt-0.5 ${meta.color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">{e.description}</div>
                    <div className="text-xs text-muted-foreground">
                      {e.actor?.name ?? (e.actor_type === "system" ? "System" : "—")} · {formatDateTime(e.created_at)}
                    </div>
                    {isExp && e.metadata && Object.keys(e.metadata).length > 0 && (
                      <pre className="text-xs bg-muted/50 mt-2 p-2 rounded overflow-x-auto">
                        {JSON.stringify(e.metadata, null, 2)}
                      </pre>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {events.length === 0 && <p className="text-sm text-muted-foreground">Inga händelser.</p>}
    </div>
  );
}
