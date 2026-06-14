// SMS-chattpanel — Sheet från höger med realtime, mallar och skick.
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CheckCheck, Clock, X as XIcon, AlertCircle, Send } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { listMessages, markMessagesRead, sendSmsToLead, listSmsTemplates } from "@/lib/sms.functions";
import { previewTemplate } from "@/lib/templates.functions";
import { formatPhone, formatDateTime } from "@/lib/format";

interface Props {
  leadId: string;
  customerName: string | null;
  phone: string;
  quietStart?: string | null;
  quietEnd?: string | null;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  mode?: "sheet" | "inline";
}

const QUICK_REPLIES: { code: string; label: string }[] = [
  { code: "quick_thanks", label: "Tack" },
  { code: "ask_photos", label: "Be om bilder" },
  { code: "missed_call", label: "Missat samtal" },
  { code: "offer_range", label: "Värdering klar" },
  { code: "dealer_offer", label: "Bud mottaget" },
  { code: "ask_price", label: "Kundens pris?" },
  { code: "ask_proceed", label: "Gå vidare?" },
  { code: "close_offer", label: "Avsluta" },
  { code: "call_me", label: "Ring mig" },
  { code: "what_think", label: "Vad tänker du?" },
];

function isQuietNow(start?: string | null, end?: string | null) {
  if (!start || !end) return false;
  const now = new Date();
  const m = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const s = sh * 60 + sm;
  const e = eh * 60 + em;
  return s > e ? m >= s || m < e : m >= s && m < e;
}

function countSegments(body: string): number {
  if (!body) return 0;
  const isUnicode = /[^\u0000-\u007F\u00A0-\u00FF]/.test(body);
  const limit = isUnicode ? 70 : 160;
  const multi = isUnicode ? 67 : 153;
  return body.length <= limit ? 1 : Math.ceil(body.length / multi);
}

function StatusIcon({ status, error }: { status: string; error?: string | null }) {
  const cn = "h-3.5 w-3.5 inline-block";
  if (status === "queued") return <Clock className={cn} aria-label="I kö" />;
  if (status === "sent") return <Check className={cn} aria-label="Skickat" />;
  if (status === "delivered" || status === "received")
    return <CheckCheck className={cn} aria-label="Levererat" />;
  if (status === "failed" || status === "undelivered")
    return <AlertCircle className={`${cn} text-destructive`} aria-label={error ?? "Misslyckat"} />;
  if (status === "cancelled") return <XIcon className={cn} aria-label="Avbrutet" />;
  return null;
}

export function SmsChatPanel({
  leadId,
  customerName,
  phone,
  quietStart,
  quietEnd,
  open: openProp,
  onOpenChange,
  mode = "sheet",
}: Props) {
  const inline = mode === "inline";
  const open = inline ? true : !!openProp;
  const qc = useQueryClient();
  const fetchMsgs = useServerFn(listMessages);
  const fetchTemplates = useServerFn(listSmsTemplates);
  const sendFn = useServerFn(sendSmsToLead);
  const markRead = useServerFn(markMessagesRead);
  const preview = useServerFn(previewTemplate);

  const msgsQ = useQuery({
    queryKey: ["messages", leadId],
    queryFn: () => fetchMsgs({ data: { leadId } }),
    enabled: open,
  });
  const tplsQ = useQuery({
    queryKey: ["sms-templates-active"],
    queryFn: () => fetchTemplates(),
    enabled: open,
  });

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Mark inbound as read + scroll bottom
  useEffect(() => {
    if (!open) return;
    markRead({ data: { leadId } }).then(() => qc.invalidateQueries({ queryKey: ["unread-counts"] }));
  }, [open, leadId, markRead, qc]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgsQ.data]);

  // Realtime subscription
  useEffect(() => {
    if (!open) return;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const ch = supabase
      .channel(`messages:${leadId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `lead_id=eq.${leadId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["messages", leadId] });
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          if (retryTimer) clearTimeout(retryTimer);
          retryTimer = setTimeout(() => {
            try {
              ch.subscribe();
            } catch {
              /* ignore */
            }
          }, 3000);
        }
      });
    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      supabase.removeChannel(ch);
    };
  }, [open, leadId, qc]);

  const quiet = useMemo(() => isQuietNow(quietStart, quietEnd), [quietStart, quietEnd]);

  async function handleQuickReply(code: string) {
    try {
      const { body } = await preview({ data: { templateCode: code, leadId } });
      setDraft(body);
    } catch (e) {
      toast.error("Kunde inte ladda mall");
    }
  }

  async function doSend(forceBypassQuiet = false) {
    if (!draft.trim() || sending) return;
    if (quiet && !forceBypassQuiet) {
      toast("Tystnad-timme (21:00–08:00). Vill du ändå skicka?", {
        action: { label: "Skicka ändå", onClick: () => doSend(true) },
      });
      return;
    }
    setSending(true);
    try {
      const res = await sendFn({ data: { leadId, message: draft } });
      if (!res.ok) {
        toast.error(res.error ?? "Skickning misslyckades");
      } else {
        setDraft("");
        qc.invalidateQueries({ queryKey: ["messages", leadId] });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fel vid skick");
    } finally {
      setSending(false);
    }
  }

  const segments = countSegments(draft);
  const chars = draft.length;
  const overlimit = chars >= 1500;

  const body = (
    <>
      <div className="px-4 py-3 border-b border-border">
        <div className="text-base font-semibold">{customerName ?? "Okänd kund"}</div>
        <a
          href={`tel:${phone}`}
          className="text-sm text-muted-foreground hover:text-foreground tabular-nums"
        >
          {formatPhone(phone)}
        </a>
      </div>

      {/* Conversation */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {msgsQ.isLoading && <p className="text-sm text-muted-foreground">Laddar…</p>}
        {msgsQ.data?.messages.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            Inga meddelanden än. Skicka första SMS:et nedan.
          </p>
        )}
        {msgsQ.data?.messages.map((m: any) => {
          const out = m.direction === "outbound";
          const isAuto = out && !!m.is_system;
          const failed = m.delivery_status === "failed" || m.delivery_status === "undelivered";
          const pending = m.delivery_status === "queued";
          const cancelled = m.delivery_status === "cancelled";
          const notSent = out && (failed || pending || cancelled);
          const bubbleCls = out
            ? notSent
              ? "bg-muted text-foreground border border-dashed border-destructive/40 opacity-80"
              : isAuto
                ? "bg-secondary text-secondary-foreground border border-border"
                : "bg-primary text-primary-foreground"
            : "bg-muted text-foreground";
          return (
            <div key={m.id} className={`flex ${out ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${bubbleCls}`}>
                <div className="text-[10px] uppercase tracking-wide opacity-70 mb-1 flex items-center gap-1">
                  <span>{out ? (isAuto ? "Auto" : "Säljare") : "Från kund"}</span>
                  {isAuto && (
                    <Badge
                      variant="outline"
                      className="ml-1 text-[9px] uppercase py-0 px-1 h-4 leading-none"
                      title={m.template_code ?? "Automatiskt SMS"}
                    >
                      {m.template_code ?? "auto"}
                    </Badge>
                  )}
                </div>
                <div>{m.body}</div>
                <div className="mt-1 flex items-center gap-1.5 text-[10px] opacity-70">
                  <span>{formatDateTime(m.created_at)}</span>
                  {out && (
                    <span title={m.delivery_error ?? m.delivery_status}>
                      <StatusIcon status={m.delivery_status} error={m.delivery_error} />
                    </span>
                  )}
                </div>
                {notSent && (
                  <div className="mt-2 flex items-center justify-between gap-2 border-t border-destructive/30 pt-1.5">
                    <span className="text-[11px] font-medium text-destructive">
                      {failed
                        ? `Misslyckades${m.delivery_error ? `: ${m.delivery_error}` : ""}`
                        : pending
                          ? "Ej skickat ännu (i kö)"
                          : "Avbrutet"}
                    </span>
                    {failed && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[10px] px-2"
                        onClick={async () => {
                          try {
                            await sendFn({ data: { leadId, message: m.body } });
                            qc.invalidateQueries({ queryKey: ["messages", leadId] });
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : "Kunde inte skicka om");
                          }
                        }}
                      >
                        Skicka om
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick replies */}
      <div className="border-t border-border px-3 py-2 overflow-x-auto whitespace-nowrap flex gap-1.5">
        {QUICK_REPLIES.map((q) => (
          <Button
            key={q.code}
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => handleQuickReply(q.code)}
          >
            {q.label}
          </Button>
        ))}
      </div>

      {/* Input */}
      <div className="border-t border-border p-3 space-y-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 1600))}
          placeholder="Skriv meddelande…"
          className="min-h-[72px] max-h-[180px] resize-none"
          rows={3}
        />
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className={overlimit ? "text-destructive font-medium" : ""}>
              {chars} / 1600
            </span>
            <span>· {segments} SMS</span>
            {quiet && (
              <Badge variant="outline" className="text-amber-500 border-amber-500/40">
                Tystnad-timme
              </Badge>
            )}
          </div>
          <Button size="sm" disabled={!draft.trim() || sending} onClick={() => doSend(false)}>
            <Send className="h-3.5 w-3.5 mr-1" />
            {sending ? "Skickar…" : "Skicka"}
          </Button>
        </div>
      </div>
    </>
  );

  if (inline) {
    return <div className="flex flex-col h-full bg-card border border-border rounded-lg overflow-hidden">{body}</div>;
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[480px] p-0 flex flex-col">
        <SheetHeader className="sr-only">
          <SheetTitle>{customerName ?? "Okänd kund"}</SheetTitle>
        </SheetHeader>
        {body}
      </SheetContent>
    </Sheet>
  );
}
