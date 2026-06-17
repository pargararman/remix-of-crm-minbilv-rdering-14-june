import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  getIntakeDebugStatus,
  listIntakeAttempts,
  sendTestIntake,
} from "@/lib/intake-debug.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/test-lead-intake")({
  component: TestLeadIntakePage,
});

function copy(text: string, label: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success(`${label} kopierad`),
    () => toast.error("Kunde inte kopiera"),
  );
}

function statusBadge(status: string) {
  const ok = status === "success";
  const warn = status === "duplicate_existing" || status === "duplicate_request";
  return (
    <Badge variant={ok ? "default" : warn ? "secondary" : "destructive"}>
      {status}
    </Badge>
  );
}

function TestLeadIntakePage() {
  const fetchStatus = useServerFn(getIntakeDebugStatus);
  const fetchAttempts = useServerFn(listIntakeAttempts);
  const sendTest = useServerFn(sendTestIntake);

  const statusQ = useQuery({
    queryKey: ["intake-debug-status"],
    queryFn: () => fetchStatus(),
  });
  const attemptsQ = useQuery({
    queryKey: ["intake-attempts"],
    queryFn: () => fetchAttempts({ data: { limit: 20 } }),
    refetchInterval: 5000,
  });

  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const runTest = async (mode: "valid" | "duplicate" | "idempotency" | "invalid") => {
    setBusy(mode);
    setResult(null);
    try {
      const res = await sendTest({ data: { mode } });
      setResult({ mode, res });
      toast.success(`Test "${mode}" klar`);
      attemptsQ.refetch();
      statusQ.refetch();
    } catch (e: any) {
      setResult({ mode, error: e?.message ?? String(e) });
      toast.error(`Test misslyckades: ${e?.message ?? e}`);
    } finally {
      setBusy(null);
    }
  };

  const examplePayload = JSON.stringify(
    {
      step: "valuation",
      regnummer: "ABC123",
      telefon: "+46701234567",
      email: "kund@example.com",
      namn: "Test Kund",
      matarstallning: "8000-12000",
      gdpr_consent: true,
    },
    null,
    2,
  );

  const exampleCode = `// Webbprojektet: skicka leadet server-side till CRM efter Resend-mejlet.
import { createHmac, randomUUID } from "node:crypto";

const raw = JSON.stringify(payload); // samma payload som send-lead-email använder
const sig = createHmac("sha256", Deno.env.get("CRM_INTAKE_WEBHOOK_SECRET")!)
  .update(raw)
  .digest("hex");

await fetch(Deno.env.get("CRM_INTAKE_URL")!, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-webhook-signature": \`sha256=\${sig}\`,
    "x-idempotency-key": randomUUID(),
  },
  body: raw,
});`;

  const status = statusQ.data;

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold">Testa lead-intag</h1>
        <p className="text-sm text-muted-foreground">
          Felsök webhook från minbilvardering.se → CRM.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Webhook-status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-44">CRM intake URL:</span>
            <code className="text-xs bg-muted px-2 py-1 rounded">
              {status?.intakeUrl ?? "—"}
            </code>
            {status?.intakeUrl && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => copy(status.intakeUrl, "URL")}
              >
                Kopiera
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-44">INTAKE_WEBHOOK_SECRET:</span>
            {status ? (
              status.secretPresent ? (
                <Badge>finns</Badge>
              ) : (
                <Badge variant="destructive">saknas</Badge>
              )
            ) : (
              "…"
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-44">Senast lyckad intake:</span>
            <span>{status?.lastSuccessAt ? formatDateTime(status.lastSuccessAt) : "—"}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-44">Senast misslyckad:</span>
            <span>
              {status?.lastFailureAt
                ? `${formatDateTime(status.lastFailureAt)} (${status.lastFailureStatus})`
                : "—"}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kopiera värden för webbprojektet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => copy(status?.intakeUrl ?? "", "CRM_INTAKE_URL")}
              disabled={!status?.intakeUrl}
            >
              Kopiera CRM_INTAKE_URL
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => copy(examplePayload, "Exempel-payload")}
            >
              Kopiera exempel-payload
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => copy(exampleCode, "Exempel-kod")}
            >
              Kopiera exempel-kod
            </Button>
          </div>
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">Visa exempel-payload</summary>
            <pre className="mt-2 bg-muted p-3 rounded overflow-auto">{examplePayload}</pre>
          </details>
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">Visa exempel-kod</summary>
            <pre className="mt-2 bg-muted p-3 rounded overflow-auto">{exampleCode}</pre>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Manuella tester</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => runTest("valid")} disabled={busy !== null}>
              Skicka testlead
            </Button>
            <Button
              variant="secondary"
              onClick={() => runTest("duplicate")}
              disabled={busy !== null}
            >
              Testa dubblett
            </Button>
            <Button
              variant="secondary"
              onClick={() => runTest("idempotency")}
              disabled={busy !== null}
            >
              Testa idempotency
            </Button>
            <Button
              variant="outline"
              onClick={() => runTest("invalid")}
              disabled={busy !== null}
            >
              Testa ogiltig lead
            </Button>
          </div>
          {result && (
            <div className="rounded border p-3 bg-muted/40">
              <div className="text-sm font-medium mb-2">Resultat: {result.mode}</div>
              <pre className="text-xs overflow-auto">{JSON.stringify(result, null, 2)}</pre>
              {result.res?.body?.lead_id && (
                <Button asChild size="sm" variant="link" className="mt-2 px-0">
                  <Link to="/leads/$leadId" params={{ leadId: result.res.body.lead_id }}>
                    Öppna skapad lead →
                  </Link>
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Senaste intake-försök (20)</CardTitle>
        </CardHeader>
        <CardContent>
          {attemptsQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Laddar…</p>
          ) : !attemptsQ.data?.attempts.length ? (
            <p className="text-sm text-muted-foreground">Inga försök registrerade ännu.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tid</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Källa</TableHead>
                  <TableHead>Regnr</TableHead>
                  <TableHead>Telefon</TableHead>
                  <TableHead>E-post</TableHead>
                  <TableHead>Lead</TableHead>
                  <TableHead>Sign.</TableHead>
                  <TableHead>Fel</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attemptsQ.data.attempts.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {formatDateTime(a.created_at)}
                    </TableCell>
                    <TableCell>{statusBadge(a.status)}</TableCell>
                    <TableCell className="text-xs">{a.source ?? "—"}</TableCell>
                    <TableCell className="text-xs">{a.registration_number ?? "—"}</TableCell>
                    <TableCell className="text-xs">{a.phone ?? "—"}</TableCell>
                    <TableCell className="text-xs">{a.email ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {a.created_lead_id ? (
                        <Link
                          to="/leads/$leadId"
                          params={{ leadId: a.created_lead_id }}
                          className="text-primary underline"
                        >
                          Öppna
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {a.signature_valid === true ? "✓" : a.signature_valid === false ? "✗" : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[240px] truncate">
                      {a.error_message ?? ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
