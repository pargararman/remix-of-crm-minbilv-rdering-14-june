// Admin-sida som dokumenterar stegförflyttningarna (manuella + automatiska).
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCompanySettings } from "@/lib/settings.functions";
import {
  AUTO_RULES,
  MANUAL_TRANSITIONS,
  STAGE_LABELS,
  STAGE_ORDER,
  type StageKey,
} from "@/lib/stage-docs";

export const Route = createFileRoute("/_authenticated/admin/stage-rules")({
  head: () => ({ meta: [{ title: "Stegregler — Min Bil Värdering" }] }),
  component: StageRulesPage,
});

function StageRulesPage() {
  const fetchSettings = useServerFn(getCompanySettings);
  const sq = useQuery({ queryKey: ["company-settings"], queryFn: () => fetchSettings() });
  const s: any = sq.data?.settings ?? {};

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Stegregler</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Översikt över när leads flyttas mellan stadier — manuellt och automatiskt.
          Tiderna nedan kan justeras under <a href="/admin/settings/timing" className="underline">Inställningar → Tider</a>.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Automatiska regler</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>När</TableHead>
                <TableHead>Från stadie</TableHead>
                <TableHead>Flyttas till</TableHead>
                <TableHead>Bieffekt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {AUTO_RULES.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">{r.trigger}</TableCell>
                  <TableCell className="space-x-1">
                    {r.affectsFrom.map((s) => (
                      <Badge key={s} variant="outline" className="text-[10px]">
                        {STAGE_LABELS[s]}
                      </Badge>
                    ))}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{STAGE_LABELS[r.movesTo]}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.sideEffect ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nuvarande tider</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Metric label="Uppföljning 1" value={s.followup_1_hours} unit="h" />
          <Metric label="Uppföljning 2" value={s.followup_2_hours} unit="h" />
          <Metric label="Uppföljning 3" value={s.followup_3_hours} unit="h" />
          <Metric label="Inget svar" value={s.inget_svar_hours} unit="h" />
          <Metric label="Auto-arkivera" value={s.auto_archive_days} unit="dagar" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Manuella övergångar</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nuvarande stadie</TableHead>
                <TableHead>Säljare kan flytta till</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {STAGE_ORDER.map((from) => (
                <TableRow key={from}>
                  <TableCell className="font-medium">{STAGE_LABELS[from]}</TableCell>
                  <TableCell className="space-x-1 space-y-1">
                    {MANUAL_TRANSITIONS[from].length === 0 ? (
                      <span className="text-xs text-muted-foreground">— (slutstadie)</span>
                    ) : (
                      MANUAL_TRANSITIONS[from].map((to: StageKey) => (
                        <Badge key={to} variant="outline" className="text-[10px]">
                          {STAGE_LABELS[to]}
                        </Badge>
                      ))
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value, unit }: { label: string; value: number | undefined; unit: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-base font-semibold tabular-nums">
        {value ?? "—"} <span className="text-xs text-muted-foreground font-normal">{unit}</span>
      </p>
    </div>
  );
}
