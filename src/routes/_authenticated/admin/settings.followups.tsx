// Admin: automatiska uppföljnings-SMS — sekvens, timing, mallar, statistik.
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MessageSquare, ArrowDown, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  getFollowupAdmin,
  updateFollowupSettings,
  updateFollowupTemplate,
} from "@/lib/followups-admin.functions";

export const Route = createFileRoute("/_authenticated/admin/settings/followups")({
  component: FollowupsPage,
});

type StepState = { code: "followup_1" | "followup_2" | "followup_3"; enabled: boolean; hours: number };

function FollowupsPage() {
  const qc = useQueryClient();
  const getFn = useServerFn(getFollowupAdmin);
  const saveFn = useServerFn(updateFollowupSettings);
  const tplFn = useServerFn(updateFollowupTemplate);

  const q = useQuery({ queryKey: ["followup-admin"], queryFn: () => getFn({}) });

  const [enabled, setEnabled] = useState(true);
  const [steps, setSteps] = useState<StepState[]>([]);
  const [bodies, setBodies] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!q.data) return;
    setEnabled(q.data.enabled);
    setSteps(q.data.steps.map((s: any) => ({ code: s.code, enabled: s.enabled, hours: s.hours })));
    const b: Record<string, string> = {};
    for (const s of q.data.steps) if (s.template) b[s.code] = s.template.body;
    setBodies(b);
  }, [q.data]);

  const saveSettings = useMutation({
    mutationFn: () =>
      saveFn({ data: { settingsId: q.data!.settingsId!, enabled, steps } }),
    onSuccess: () => {
      toast.success("Inställningar sparade");
      qc.invalidateQueries({ queryKey: ["followup-admin"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Kunde inte spara"),
  });

  const saveTemplate = useMutation({
    mutationFn: (args: { templateId: string; body: string; isActive: boolean }) =>
      tplFn({ data: args }),
    onSuccess: () => {
      toast.success("Mall sparad");
      qc.invalidateQueries({ queryKey: ["followup-admin"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Kunde inte spara mall"),
  });

  if (q.isLoading) return <p className="text-sm text-muted-foreground p-4">Hämtar…</p>;
  if (q.isError || !q.data) return <p className="text-sm text-destructive p-4">Kunde inte hämta inställningarna.</p>;
  const d = q.data;

  return (
    <div className="max-w-3xl space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold">Automatiska uppföljnings-SMS</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Sekvensen schemaläggs när ett nytt lead kommer in och avbryts automatiskt
          när kunden svarar, eller när leadet publiceras, vinns, förloras eller arkiveras.
          Tystnadstimmar respekteras ({d.quietHours.start}–{d.quietHours.end}).
        </p>
      </div>

      <Card className="p-4 flex items-center justify-between">
        <div>
          <div className="font-medium">Uppföljningar aktiverade</div>
          <div className="text-sm text-muted-foreground">
            Huvudbrytare — av stänger hela sekvensen (även redan köade SMS stoppas vid utskickstillfället).
          </div>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </Card>

      {/* Sekvensvy */}
      <div className="space-y-1">
        <Card className="p-3 text-sm flex items-center gap-2">
          <Badge variant="secondary">Start</Badge>
          Nytt lead kommer in via intaget — sekvensen schemaläggs.
        </Card>
        {d.steps.map((s: any, i: number) => {
          const st = steps[i];
          if (!st) return null;
          return (
            <div key={s.code}>
              <div className="flex justify-center py-0.5">
                <ArrowDown className="h-4 w-4 text-muted-foreground" />
              </div>
              <Card className={`p-4 space-y-3 ${!st.enabled || !enabled ? "opacity-60" : ""}`}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Uppföljning {s.order}</span>
                    <Badge variant="outline" className="text-xs">
                      <Clock className="h-3 w-3 mr-1" />
                      {st.hours} h efter intag
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      30 dgr: {s.stats.sent} skickade · {s.stats.queued} köade · {s.stats.cancelled} avbrutna
                      {s.stats.failed ? ` · ${s.stats.failed} misslyckade` : ""}
                    </span>
                    <Switch
                      checked={st.enabled}
                      onCheckedChange={(v) =>
                        setSteps((p) => p.map((x, xi) => (xi === i ? { ...x, enabled: v } : x)))
                      }
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-muted-foreground w-40">Skickas efter (timmar)</label>
                  <Input
                    type="number"
                    className="w-28"
                    min={1}
                    max={720}
                    value={st.hours}
                    onChange={(e) =>
                      setSteps((p) =>
                        p.map((x, xi) =>
                          xi === i ? { ...x, hours: Math.max(1, parseInt(e.target.value || "1", 10)) } : x,
                        ),
                      )
                    }
                  />
                </div>
                {s.template ? (
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">
                      SMS-text (variabler: {"{KUNDNAMN}, {REGNR}, {VARDERING_FRAN}, {VARDERING_TILL}"})
                    </label>
                    <Textarea
                      rows={3}
                      value={bodies[s.code] ?? ""}
                      onChange={(e) => setBodies((p) => ({ ...p, [s.code]: e.target.value }))}
                    />
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={saveTemplate.isPending || (bodies[s.code] ?? "") === s.template.body}
                        onClick={() =>
                          saveTemplate.mutate({
                            templateId: s.template.id,
                            body: bodies[s.code] ?? "",
                            isActive: s.template.isActive,
                          })
                        }
                      >
                        Spara mall
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-destructive">
                    Mall saknas i databasen (kod: {s.code}) — skapa den under SMS-mallar.
                  </p>
                )}
              </Card>
            </div>
          );
        })}
        <div className="flex justify-center py-0.5">
          <ArrowDown className="h-4 w-4 text-muted-foreground" />
        </div>
        <Card className="p-3 text-sm flex items-center gap-2">
          <Badge variant="secondary">Slut</Badge>
          Inget svar efter sekvensen — leadet flyttas mot "Inget svar"/arkivering enligt stegreglerna.
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending || !d.settingsId}>
          {saveSettings.isPending ? "Sparar…" : "Spara inställningar"}
        </Button>
      </div>
    </div>
  );
}
