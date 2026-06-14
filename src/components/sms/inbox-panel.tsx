// SMS Inbox-panel — visas på dashboard till höger (eller under på mobil).
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare, ArrowRight, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listConversations } from "@/lib/sms.functions";
import { SmsChatPanel } from "@/components/leads/sms-chat";
import { formatRelative } from "@/lib/format";
import { useInboxRealtime } from "@/hooks/use-inbox-realtime";

export function InboxPanel() {
  useInboxRealtime();
  const fetchConvs = useServerFn(listConversations);
  const [tab, setTab] = useState<"unread" | "all">("unread");
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [openMeta, setOpenMeta] = useState<{ name: string | null; phone: string } | null>(null);

  const q = useQuery({
    queryKey: ["conversations"],
    queryFn: () => fetchConvs({ data: { limit: 50 } }),
    refetchInterval: 30000,
  });

  const all = q.data?.conversations ?? [];
  const unread = useMemo(() => all.filter((c) => c.unread > 0), [all]);
  const list = tab === "unread" ? unread : all;

  return (
    <Card className="sticky top-32">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            SMS Inbox
            {unread.length > 0 && (
              <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                {unread.length}
              </Badge>
            )}
          </CardTitle>
          <Link
            to="/inkorg"
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            Öppna inkorg →
          </Link>
        </div>
        <div className="flex gap-1 pt-1">
          <button
            type="button"
            className={`px-2 py-1 text-xs rounded border transition ${
              tab === "unread" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setTab("unread")}
          >
            Olästa ({unread.length})
          </button>
          <button
            type="button"
            className={`px-2 py-1 text-xs rounded border transition ${
              tab === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setTab("all")}
          >
            Alla
          </button>
        </div>
      </CardHeader>
      <CardContent className="p-0 max-h-[600px] overflow-y-auto">
        {q.isLoading && <p className="text-xs text-muted-foreground p-4">Laddar…</p>}
        {!q.isLoading && list.length === 0 && (
          <p className="text-xs text-muted-foreground p-4 text-center">
            {tab === "unread" ? "Inga olästa SMS just nu." : "Inga konversationer än."}
          </p>
        )}
        {list.map((c) => (
          <button
            key={c.leadId}
            type="button"
            onClick={() => {
              setOpenLeadId(c.leadId);
              setOpenMeta({ name: c.customerName, phone: c.phone });
            }}
            className={`w-full text-left px-3 py-2 border-b border-border/50 hover:bg-elevated transition flex gap-2 ${
              c.unread > 0 ? "bg-status-urgent/5" : ""
            }`}
          >
            <Avatar name={c.customerName ?? "?"} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium truncate">{c.customerName ?? "Okänd"}</span>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {formatRelative(c.lastAt)}
                </span>
              </div>
              <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
                {c.lastDirection === "outbound" && <Check className="h-3 w-3 opacity-60 shrink-0" />}
                <span className="truncate">{c.lastBody}</span>
              </div>
              <div className="text-[10px] text-muted-foreground truncate">
                {[c.vehicle?.brand, c.vehicle?.model].filter(Boolean).join(" ") || "—"} · {c.regnr}
              </div>
            </div>
            {c.unread > 0 && (
              <Badge variant="destructive" className="h-5 px-1.5 text-[10px] shrink-0 self-start animate-pulse">
                {c.unread}
              </Badge>
            )}
          </button>
        ))}
        {list.length > 0 && (
          <div className="p-2 border-t border-border">
            <Button asChild variant="ghost" size="sm" className="w-full text-xs">
              <Link to="/inkorg">
                Visa alla konversationer <ArrowRight className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </div>
        )}
      </CardContent>

      {openLeadId && openMeta && (
        <SmsChatPanel
          leadId={openLeadId}
          customerName={openMeta.name}
          phone={openMeta.phone}
          open={!!openLeadId}
          onOpenChange={(v) => {
            if (!v) setOpenLeadId(null);
          }}
        />
      )}
    </Card>
  );
}

function Avatar({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const colors = ["bg-blue-500/20 text-blue-700 dark:text-blue-300",
    "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
    "bg-violet-500/20 text-violet-700 dark:text-violet-300",
    "bg-amber-500/20 text-amber-700 dark:text-amber-300",
    "bg-pink-500/20 text-pink-700 dark:text-pink-300"];
  const idx = (initial.charCodeAt(0) || 0) % colors.length;
  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${colors[idx]}`}>
      {initial}
    </div>
  );
}
