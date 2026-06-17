import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle, Shield } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/security")({
  head: () => ({ meta: [{ title: "Säkerhetschecklista — Admin" }] }),
  component: SecurityChecklist,
});

interface CheckItem {
  category: string;
  title: string;
  description: string;
  status: "ok" | "review" | "warning";
}

const ITEMS: CheckItem[] = [
  { category: "Auth", title: "Lösenordskrav", description: "Supabase Auth kräver minst 6 tecken. Rekommendera 8+.", status: "review" },
  { category: "Auth", title: "Email-bekräftelse aktiverad", description: "Användare måste verifiera e-post före inloggning.", status: "ok" },
  { category: "Auth", title: "Google OAuth via Lovable-broker", description: "Implementerad och konfigurerad.", status: "ok" },
  { category: "RLS", title: "Alla tabeller har RLS", description: "leads, dealers, billing_logs, audit_logs, notifications.", status: "ok" },
  { category: "RLS", title: "Roller separerade från profiler", description: "Använd has_role()-funktion, ingen privilege escalation.", status: "ok" },
  { category: "RLS", title: "Dealer-isolation", description: "Handlare ser endast egna leads via dealer_users-koppling.", status: "ok" },
  { category: "PII", title: "GDPR-anonymisering implementerad", description: "/admin/gdpr scrubbar customer_name, phone, email.", status: "ok" },
  { category: "PII", title: "Lead-access loggas", description: "lead_access_logs sparar vem som tittade när.", status: "ok" },
  { category: "Webhooks", title: "Twilio-signatur verifieras", description: "Inkommande SMS validerar X-Twilio-Signature.", status: "review" },
  { category: "Webhooks", title: "Intake-webhook har shared secret", description: "INTAKE_WEBHOOK_SECRET konfigurerad.", status: "ok" },
  { category: "Server", title: "Service-role-nyckel endast server-side", description: "client.server.ts importeras aldrig i klient-kod.", status: "ok" },
  { category: "Server", title: "Server-fn använder requireSupabaseAuth", description: "Alla användardata-fn har middleware aktiverad.", status: "ok" },
  { category: "Audit", title: "Audit-loggning för admin-handlingar", description: "Faktureringsändringar, GDPR-requests, rollbyten loggas.", status: "ok" },
  { category: "Backup", title: "Daglig backup", description: "company_settings.daily_backup_enabled — kräver cron-job för aktivering.", status: "warning" },
  { category: "Data", title: "Retention-policy konfigurerad", description: "company_settings.retention_lost_months (24), retention_archive_months (36).", status: "ok" },
];

const tone = {
  ok: { icon: CheckCircle2, color: "text-status-won", label: "OK" },
  review: { icon: Shield, color: "text-status-active", label: "Granska" },
  warning: { icon: AlertCircle, color: "text-status-urgent", label: "Åtgärda" },
} as const;

function SecurityChecklist() {
  const grouped = ITEMS.reduce<Record<string, CheckItem[]>>((acc, item) => {
    (acc[item.category] ||= []).push(item);
    return acc;
  }, {});
  const total = ITEMS.length;
  const ok = ITEMS.filter((i) => i.status === "ok").length;

  return (
    <div className="container max-w-4xl mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Säkerhetschecklista</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {ok} av {total} kontroller godkända. Granska resterande poster regelbundet.
        </p>
      </div>
      {Object.entries(grouped).map(([category, items]) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle className="text-base">{category}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {items.map((item) => {
              const t = tone[item.status];
              const Icon = t.icon;
              return (
                <div key={item.title} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
                  <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${t.color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{item.title}</span>
                      <Badge variant="outline" className="text-[10px]">{t.label}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
