// SMS-diagnostik: senaste meddelanden, kö, fel, orphans och webhook-status.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, RefreshCw, Copy, AlertTriangle, CheckCircle2, Zap } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { getSmsDebugStatus, sendTestInboundPing, probeTwilioWebhookReachability } from "@/lib/sms-debug.functions";
import { formatRelative, formatDateTime, formatPhone } from "@/lib/format";
import { RouteError, RoutePending } from "@/components/route-boundaries";

export const Route = createFileRoute("/_authenticated/admin/sms-debug")({
  head: () => ({ meta: [{ title: "SMS-diagnostik" }] }),
  component: SmsDebugPage,
  pendingComponent: RoutePending,
  errorComponent: RouteError,
});

function statusBadge(s: string) {
  const map: Record<string, string> = {
    queued: "bg-amber-500/15 text-amber-600 border-amber-500/30",
    sent: "bg-blue-500/15 text-blue-600 border-blue-500/30",
    delivered: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
    received: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
    failed: "bg-destructive/15 text-destructive border-destructive/30",
    undelivered: "bg-destructive/15 text-destructive border-destructive/30",
    cancelled: "bg-muted text-muted-foreground border-border",
  };
  return map[s] ?? "bg-muted text-muted-foreground border-border";
}

function copy(text: string) {
  navigator.clipboard.writeText(text).then(() => toast.success("Kopierat"));
}

function SmsDebugPage() {
  const fetchStatus = useServerFn(getSmsDebugStatus);
  const testPing = useServerFn(sendTestInboundPing);
  const probe = useServerFn(probeTwilioWebhookReachability);
  const [pinging, setPinging] = useState(false);
  const [pingResult, setPingResult] = useState<null | { ok: boolean; status: number; sid: string; response: string }>(null);
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<null | { results: Array<{ url: string; status: number; contentType: string; location: string | null; isRedirect: boolean; looksLikeHtml: boolean; reachable: boolean; bodyPreview: string }> }>(null);
  const q = useQuery({
    queryKey: ["sms-debug"],
    queryFn: () => fetchStatus(),
    refetchInterval: 15000,
  });

  const d = q.data;

  async function runPing() {
    setPinging(true);
    setPingResult(null);
    try {
      const r = await testPing({ data: {} });
      setPingResult(r);
      if (r.ok) {
        toast.success(`Webhook svarade ${r.status} — pipeline fungerar`);
        setTimeout(() => q.refetch(), 800);
      } else {
        toast.error(`Webhook svarade ${r.status}`);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Test misslyckades");
    } finally {
      setPinging(false);
    }
  }

  async function runProbe() {
    setProbing(true);
    setProbeResult(null);
    try {
      const r = await probe({ data: undefined as any });
      setProbeResult(r);
      const allReachable = r.results.every((x) => x.reachable);
      if (allReachable) toast.success("Webhook nås direkt — ingen redirect");
      else toast.error("Webhook nås INTE direkt — se resultatet nedan");
    } catch (e: any) {
      toast.error(e?.message ?? "Probe misslyckades");
    } finally {
      setProbing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/">
              <ArrowLeft className="h-4 w-4 mr-1" /> Tillbaka
            </Link>
          </Button>
          <h1 className="text-xl font-semibold">SMS-diagnostik</h1>
        </div>
        <Button size="sm" variant="outline" onClick={() => q.refetch()}>
          <RefreshCw className={`h-4 w-4 mr-1 ${q.isFetching ? "animate-spin" : ""}`} /> Uppdatera
        </Button>
      </div>

      {/* PROMINENT WEBHOOK-URL BANNER */}
      {d && (
        <Card className="border-2 border-primary/40 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-primary" />
              Konfigurera denna URL i Twilio
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                Inkommande SMS — A MESSAGE COMES IN (HTTP POST)
              </div>
              <div className="flex items-center gap-2 bg-background border-2 border-primary/30 rounded-md px-3 py-3">
                <code className="text-sm md:text-base font-mono flex-1 break-all select-all">{d.urls.inbound}</code>
                <Button size="sm" onClick={() => copy(d.urls.inbound)}>
                  <Copy className="h-4 w-4 mr-1" /> Kopiera
                </Button>
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                Leveransstatus — STATUS CALLBACK URL (HTTP POST)
              </div>
              <div className="flex items-center gap-2 bg-background border border-border rounded-md px-3 py-2">
                <code className="text-xs font-mono flex-1 break-all select-all">{d.urls.status}</code>
                <Button size="sm" variant="outline" onClick={() => copy(d.urls.status)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <ol className="text-sm space-y-1 list-decimal list-inside text-muted-foreground pt-2 border-t border-border">
              <li>Öppna <a href="https://console.twilio.com/" target="_blank" rel="noreferrer" className="text-primary underline">Twilio Console</a></li>
              <li>Gå till <b>Phone Numbers → Manage → Active Numbers</b></li>
              <li>Klicka på ditt Twilio-nummer</li>
              <li>Under <b>Messaging Configuration</b>, sätt <b>"A MESSAGE COMES IN"</b> till <b>Webhook</b>, metod <b>HTTP POST</b></li>
              <li>Klistra in URL:en ovan och klicka <b>Save</b></li>
              <li>Skicka ett SMS till numret eller klicka "Skicka test-ping" nedan</li>
            </ol>

            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
              <Button onClick={runPing} disabled={pinging} size="sm">
                <Zap className={`h-4 w-4 mr-1 ${pinging ? "animate-pulse" : ""}`} />
                {pinging ? "Skickar…" : "Skicka test-ping till webhook"}
              </Button>
              <Button onClick={runProbe} disabled={probing} size="sm" variant="outline">
                <Zap className={`h-4 w-4 mr-1 ${probing ? "animate-pulse" : ""}`} />
                {probing ? "Testar…" : "Testa webhook-URL (utan signatur)"}
              </Button>
              <span className="text-xs text-muted-foreground w-full">
                Test-ping skickar ett signerat fake-SMS hela vägen igenom. URL-testet visar bara om
                Twilio når servern utan att fastna i en redirect.
              </span>
              {pingResult && (
                <div className={`w-full text-xs rounded border p-2 mt-1 ${pingResult.ok ? "border-emerald-500/30 bg-emerald-500/5" : "border-destructive/30 bg-destructive/5"}`}>
                  <div className="font-medium">Test-ping: HTTP {pingResult.status} — SID {pingResult.sid}</div>
                  {pingResult.response && <pre className="mt-1 text-[10px] whitespace-pre-wrap break-all">{pingResult.response}</pre>}
                </div>
              )}
              {probeResult && (
                <div className="w-full space-y-1.5 mt-1">
                  {probeResult.results.map((r) => (
                    <div
                      key={r.url}
                      className={`text-xs rounded border p-2 ${r.reachable ? "border-emerald-500/30 bg-emerald-500/5" : "border-destructive/30 bg-destructive/5"}`}
                    >
                      <div className="font-mono break-all">{r.url}</div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                        <span><b>HTTP {r.status}</b></span>
                        <span>content-type: {r.contentType || "—"}</span>
                        {r.location && <span>→ <span className="font-mono">{r.location}</span></span>}
                        <span>{r.reachable ? "✅ direkt-nås" : r.isRedirect ? "❌ redirect (Twilio följer inte)" : r.looksLikeHtml ? "❌ HTML returnerades" : "❌ ej nåbar"}</span>
                      </div>
                      {r.bodyPreview && (
                        <pre className="mt-1 text-[10px] whitespace-pre-wrap break-all opacity-70">{r.bodyPreview}</pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* VARNING: fel hostnamn */}
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          <b>Twilio måste peka på custom-domänen</b> (t.ex. <code>app.minbilvardering.se</code>) —
          INTE <code>bilbud-koll.lovable.app</code>. Den senare gör en 302-redirect och Twilio
          följer aldrig redirects på webhooks. Använd alltid URL:en ovan.
        </AlertDescription>
      </Alert>


      {q.isLoading && <p className="text-sm text-muted-foreground">Laddar…</p>}
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}

      {d && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Twilio-konfiguration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <ConfigItem ok={d.env.hasAccountSid} label="Account SID" />
                <ConfigItem ok={d.env.hasAuthToken} label="Auth Token" />
                <ConfigItem ok={d.env.hasFromNumber} label="Avsändarnummer" />
                <ConfigItem ok={!d.env.testMode} label={d.env.testMode ? "TESTLÄGE PÅ" : "Produktion"} />
              </div>
              {d.env.fromNumber && (
                <div className="text-xs text-muted-foreground">
                  Avsändare: <span className="tabular-nums">{formatPhone(d.env.fromNumber)}</span>
                </div>
              )}

              {d.counts.inboundTotal === 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Inga inkommande SMS finns i databasen — sätt webhook-URL:en ovan i Twilio.
                  </AlertDescription>
                </Alert>
              )}

              {d.counts.signatureFails > 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    {d.counts.signatureFails} webhook-anrop avvisades (ogiltig Twilio-signatur). Kontrollera
                    att <code>TWILIO_AUTH_TOKEN</code> och <code>TWILIO_WEBHOOK_BASE_URL</code> matchar.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Räknare */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
            <Stat label="Inkommande totalt" value={d.counts.inboundTotal} />
            <Stat label="Utgående totalt" value={d.counts.outboundTotal} />
            <Stat label="I kö" value={d.counts.queued} tone={d.counts.queued > 0 ? "warn" : undefined} />
            <Stat label="Misslyckade" value={d.counts.failed} tone={d.counts.failed > 0 ? "danger" : undefined} />
            <Stat label="Orphans" value={d.counts.orphans} tone={d.counts.orphans > 0 ? "warn" : undefined} />
            <Stat label="Sig-fel" value={d.counts.signatureFails} tone={d.counts.signatureFails > 0 ? "danger" : undefined} />
          </div>

          {/* Misslyckade */}
          {d.failed.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base text-destructive">Misslyckade utgående</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {d.failed.map((m: any) => (
                  <div key={m.id} className="text-sm border border-destructive/30 rounded p-2">
                    <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                      <span className="tabular-nums">{formatPhone(m.to_phone ?? "")}</span>
                      <span>{formatRelative(m.created_at)}</span>
                    </div>
                    <div className="truncate">{m.body}</div>
                    {m.delivery_error && <div className="text-xs text-destructive mt-1">{m.delivery_error}</div>}
                    <Link to="/leads/$leadId" params={{ leadId: m.lead_id }} className="text-xs text-primary underline">
                      Öppna lead
                    </Link>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Kö */}
          {d.queued.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">I kö (queued)</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {d.queued.map((m: any) => (
                  <div key={m.id} className="text-sm border border-border rounded p-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span className="tabular-nums">{formatPhone(m.to_phone ?? "")}</span>
                      <span>köad {formatRelative(m.created_at)}</span>
                    </div>
                    <div className="truncate">{m.body}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Senaste meddelanden */}
          <Card>
            <CardHeader><CardTitle className="text-base">Senaste 30 meddelanden</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {d.recent.length === 0 && <p className="text-sm text-muted-foreground">Inga meddelanden ännu.</p>}
              {d.recent.map((m: any) => (
                <div key={m.id} className="text-xs border-b border-border/50 py-1.5 flex flex-wrap gap-2 items-center">
                  <Badge variant="outline" className={statusBadge(m.delivery_status)}>{m.delivery_status}</Badge>
                  <span className="font-medium">{m.direction === "inbound" ? "← IN" : "→ UT"}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatPhone((m.direction === "inbound" ? m.from_phone : m.to_phone) ?? "")}
                  </span>
                  <span className="flex-1 truncate min-w-[150px]">{m.body}</span>
                  <span className="text-muted-foreground whitespace-nowrap">{formatDateTime(m.created_at)}</span>
                  {m.lead_id && (
                    <Link to="/leads/$leadId" params={{ leadId: m.lead_id }} className="text-primary underline">
                      lead
                    </Link>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Orphans */}
          {d.orphans.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  Inkommande utan matchande lead
                  <Button asChild variant="outline" size="sm">
                    <Link to="/admin/orphan-sms">Hantera orphans</Link>
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {d.orphans.map((o: any) => (
                  <div key={o.id} className="text-xs border-b border-border/50 py-1.5 flex flex-wrap gap-2">
                    <span className="tabular-nums">{formatPhone(o.from_phone)}</span>
                    <span className="flex-1 truncate">{o.body}</span>
                    <span className="text-muted-foreground">{formatRelative(o.received_at)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function ConfigItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-1.5 text-xs rounded border px-2 py-1.5 ${ok ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400" : "border-destructive/30 bg-destructive/5 text-destructive"}`}>
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
      <span>{label}</span>
    </div>
  );
}

function UrlRow({ label, url }: { label: string; url: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="flex items-center gap-2 bg-muted rounded px-2 py-1.5 mt-0.5">
        <code className="text-xs flex-1 break-all">{url}</code>
        <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => copy(url)}>
          <Copy className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "warn" | "danger" }) {
  const cls =
    tone === "danger"
      ? "border-destructive/30 bg-destructive/5"
      : tone === "warn"
        ? "border-amber-500/30 bg-amber-500/5"
        : "border-border bg-card";
  return (
    <div className={`rounded border p-2 ${cls}`}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
