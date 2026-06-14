// Full SMS-inkorg: konversationslista + aktiv chatt sida vid sida.
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { ArrowLeft, MessageSquare, Search, Pin, Mail, ExternalLink, Phone } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listConversations, markConversationUnread, togglePinConversation } from "@/lib/sms.functions";
import { SmsChatPanel } from "@/components/leads/sms-chat";
import { useInboxRealtime } from "@/hooks/use-inbox-realtime";
import { formatRelative, formatPhone } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/inkorg")({
  head: () => ({ meta: [{ title: "Inkorg — Min Bil Värdering" }] }),
  component: InkorgPage,
});

function InkorgPage() {
  useInboxRealtime();
  const fetchConvs = useServerFn(listConversations);
  const markUnread = useServerFn(markConversationUnread);
  const togglePin = useServerFn(togglePinConversation);
  const qc = useQueryClient();

  const [tab, setTab] = useState<"unread" | "all">("all");
  const [search, setSearch] = useState("");
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["conversations"],
    queryFn: () => fetchConvs({ data: { limit: 200 } }),
    refetchInterval: 30000,
  });

  const all = q.data?.conversations ?? [];
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    let list = tab === "unread" ? all.filter((c) => c.unread > 0) : all;
    if (s) {
      list = list.filter(
        (c) =>
          (c.customerName ?? "").toLowerCase().includes(s) ||
          c.phone.toLowerCase().includes(s) ||
          c.regnr.toLowerCase().includes(s) ||
          (c.lastBody ?? "").toLowerCase().includes(s),
      );
    }
    return list;
  }, [all, tab, search]);

  const active = filtered.find((c) => c.leadId === activeLeadId) ?? all.find((c) => c.leadId === activeLeadId);
  const unreadCount = all.filter((c) => c.unread > 0).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/"><ArrowLeft className="h-4 w-4 mr-1" /> Dashboard</Link>
        </Button>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <MessageSquare className="h-5 w-5" /> Inkorg
          {unreadCount > 0 && <Badge variant="destructive">{unreadCount}</Badge>}
        </h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[340px_1fr] gap-3 h-[calc(100vh-180px)] min-h-[500px]">
        {/* Lista */}
        <Card className={`flex flex-col overflow-hidden ${active ? "hidden md:flex" : ""}`}>
          <div className="p-3 border-b border-border space-y-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Sök i konversationer…"
                className="pl-7 h-8 text-sm"
              />
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                className={`px-2 py-1 text-xs rounded border ${tab === "unread" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}
                onClick={() => setTab("unread")}
              >
                Olästa ({unreadCount})
              </button>
              <button
                type="button"
                className={`px-2 py-1 text-xs rounded border ${tab === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}
                onClick={() => setTab("all")}
              >
                Alla
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {q.isLoading && <p className="p-4 text-sm text-muted-foreground">Laddar…</p>}
            {!q.isLoading && filtered.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground text-center">Inga konversationer.</p>
            )}
            {filtered.map((c) => (
              <button
                key={c.leadId}
                type="button"
                onClick={() => setActiveLeadId(c.leadId)}
                className={`w-full text-left px-3 py-2 border-b border-border/50 hover:bg-elevated transition flex gap-2 ${
                  activeLeadId === c.leadId ? "bg-elevated" : ""
                } ${c.unread > 0 ? "border-l-2 border-l-status-urgent" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate flex items-center gap-1">
                      {c.pinnedAt && <Pin className="h-3 w-3 text-primary shrink-0" />}
                      {c.customerName ?? "Okänd"}
                    </span>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {formatRelative(c.lastAt)}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{c.lastBody}</div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {[c.vehicle?.brand, c.vehicle?.model].filter(Boolean).join(" ") || "—"} · {c.regnr}
                  </div>
                </div>
                {c.unread > 0 && (
                  <Badge variant="destructive" className="h-5 px-1.5 text-[10px] self-start animate-pulse">
                    {c.unread}
                  </Badge>
                )}
              </button>
            ))}
          </div>
        </Card>

        {/* Chatt */}
        <div className={`flex flex-col gap-2 ${!active ? "hidden md:flex" : ""}`}>
          {active ? (
            <>
              <Card className="p-3 flex flex-wrap items-center gap-2">
                <Button size="sm" variant="ghost" className="md:hidden" onClick={() => setActiveLeadId(null)}>
                  <ArrowLeft className="h-4 w-4 mr-1" /> Lista
                </Button>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{active.customerName ?? "Okänd"}</div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {formatPhone(active.phone)} · {active.regnr}
                    {active.vehicle && ` · ${[active.vehicle.brand, active.vehicle.model].filter(Boolean).join(" ")}`}
                  </div>
                </div>
                <div className="flex gap-1 flex-wrap">
                  {active.phone && (
                    <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                      <a href={`tel:${active.phone}`}>
                        <Phone className="h-3 w-3 mr-1" /> Ring
                      </a>
                    </Button>
                  )}
                  <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                    <Link to="/leads/$leadId" params={{ leadId: active.leadId }}>
                      <ExternalLink className="h-3 w-3 mr-1" /> Öppna lead
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={async () => {
                      try {
                        await markUnread({ data: { leadId: active.leadId } });
                        qc.invalidateQueries({ queryKey: ["conversations"] });
                        qc.invalidateQueries({ queryKey: ["unread-counts"] });
                        toast.success("Markerad som oläst");
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Fel");
                      }
                    }}
                  >
                    <Mail className="h-3 w-3 mr-1" /> Markera oläst
                  </Button>
                  <Button
                    size="sm"
                    variant={active.pinnedAt ? "default" : "outline"}
                    className="h-7 text-xs"
                    onClick={async () => {
                      try {
                        await togglePin({ data: { leadId: active.leadId, pinned: !active.pinnedAt } });
                        qc.invalidateQueries({ queryKey: ["conversations"] });
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Fel");
                      }
                    }}
                  >
                    <Pin className="h-3 w-3 mr-1" /> {active.pinnedAt ? "Avpinna" : "Pinna"}
                  </Button>
                </div>
              </Card>

              <div className="flex-1 min-h-0">
                <SmsChatPanel
                  key={active.leadId}
                  leadId={active.leadId}
                  customerName={active.customerName}
                  phone={active.phone}
                  mode="inline"
                />
              </div>
            </>
          ) : (
            <Card className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Välj en konversation till vänster
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
