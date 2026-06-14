// Admin: lead-score-vikter (justera och räkna om alla leads).
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  getLeadScoreWeights,
  updateLeadScoreWeights,
  recomputeAllLeadScores,
} from "@/lib/pricing.functions";

export const Route = createFileRoute("/_authenticated/admin/settings/lead-score")({
  head: () => ({ meta: [{ title: "Lead-score — Min Bil Värdering" }] }),
  component: LeadScoreAdmin,
});

const WEIGHT_LABEL: Record<string, string> = {
  low_mileage: "Lågt miltal (<15 000 mil)",
  high_mileage: "Högt miltal (>25 000 mil)",
  recent_year: "Nyare bil (≤ 5 år)",
  old_year: "Äldre bil (≥ 10 år)",
  premium_brand: "Premiummärke (BMW/Mercedes/Audi/Volvo/Tesla/Porsche/Lexus)",
  ev_or_hybrid: "El- eller hybridbil",
  service_book_full: "Fullständig servicebok",
  has_photos: "Har bilder uppladdade",
  metro_city: "Storstad (Stockholm/Göteborg/Malmö)",
  previous_lost_duplicate: "Tidigare förlorad/inget-svar-dubblett",
  tag_not_serious: "Taggad som 'Ej seriös'",
};

function LeadScoreAdmin() {
  const fetchFn = useServerFn(getLeadScoreWeights);
  const updateFn = useServerFn(updateLeadScoreWeights);
  const recomputeFn = useServerFn(recomputeAllLeadScores);
  const q = useQuery({ queryKey: ["lead-score-weights"], queryFn: () => fetchFn() });

  const [weights, setWeights] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [recomputing, setRecomputing] = useState(false);

  useEffect(() => {
    if (q.data?.weights) setWeights(q.data.weights as Record<string, number>);
  }, [q.data]);

  async function save() {
    if (!q.data?.id) return;
    setSaving(true);
    try {
      await updateFn({ data: { id: q.data.id, weights } });
      toast.success("Vikter sparade");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte spara");
    } finally {
      setSaving(false);
    }
  }

  async function recompute() {
    setRecomputing(true);
    try {
      const r = await recomputeFn();
      toast.success(`${r.updated} leads omräknade`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte räkna om");
    } finally {
      setRecomputing(false);
    }
  }

  if (q.isLoading) return <p className="text-muted-foreground">Laddar…</p>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Lead-score</h1>
        <p className="text-sm text-muted-foreground">
          Justera vikter (−100 till +100). Basvärde 50. Lead-score klipps till 0–100.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vikter</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Object.keys(WEIGHT_LABEL).map((k) => (
            <div key={k} className="grid grid-cols-3 items-center gap-2">
              <Label className="col-span-2 text-sm">{WEIGHT_LABEL[k]}</Label>
              <Input
                type="number"
                value={weights[k] ?? 0}
                min={-100}
                max={100}
                onChange={(e) =>
                  setWeights({ ...weights, [k]: Number(e.target.value) || 0 })
                }
                className="text-right tabular-nums"
              />
            </div>
          ))}
          <div className="flex gap-2 pt-2">
            <Button onClick={save} disabled={saving}>
              {saving ? "Sparar…" : "Spara vikter"}
            </Button>
            <Button variant="outline" onClick={recompute} disabled={recomputing}>
              {recomputing ? "Räknar om…" : "Räkna om alla leads"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
