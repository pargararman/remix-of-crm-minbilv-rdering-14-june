// Publicera-modal med matchningar.
import { useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { matchDealersForLead } from "@/lib/dealers.functions";
import { publishLeadToDealers } from "@/lib/dealer-publications.functions";

export function PublishToDealersModal({ leadId, open, onOpenChange }: {
  leadId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const matchFn = useServerFn(matchDealersForLead);
  const publishFn = useServerFn(publishLeadToDealers);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["dealer-matches", leadId],
    queryFn: () => matchFn({ data: { leadId } }),
    enabled: open,
  });

  const [minScore, setMinScore] = useState(60);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [comment, setComment] = useState("");
  const [sharePhotos, setSharePhotos] = useState(true);
  const [shareCity, setShareCity] = useState(true);
  const [includePricing, setIncludePricing] = useState(true);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(
    () => (q.data?.matches ?? []).filter((m: any) => m.match_score >= minScore),
    [q.data, minScore],
  );

  const toggle = (id: string) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };

  const submit = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    try {
      await publishFn({
        data: {
          leadId,
          dealer_ids: Array.from(selected),
          dealer_comment: comment.trim() || undefined,
          share_photos: sharePhotos,
          share_city: shareCity,
          include_pricing_range: includePricing,
        },
      });
      qc.invalidateQueries({ queryKey: ["lead-publications", leadId] });
      qc.invalidateQueries({ queryKey: ["lead-detail", leadId] });
      onOpenChange(false);
      setSelected(new Set());
      setComment("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Publicera till handlare</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">Min match-score: {minScore}%</Label>
            <Slider value={[minScore]} onValueChange={(v) => setMinScore(v[0])} min={0} max={100} step={5} />
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto border rounded-lg p-2">
            {q.isLoading && <p className="text-sm text-muted-foreground">Söker matchningar…</p>}
            {!q.isLoading && filtered.length === 0 && (
              <p className="text-sm text-muted-foreground">Inga handlare matchar.</p>
            )}
            {filtered.map((m: any) => (
              <label key={m.dealer_id} className="flex items-start gap-3 p-2 rounded hover:bg-muted/40 cursor-pointer">
                <Checkbox checked={selected.has(m.dealer_id)} onCheckedChange={() => toggle(m.dealer_id)} className="mt-1" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm">{m.company_name}</span>
                    <Badge variant="secondary">{m.match_score}% match</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {m.city}{m.region ? ` · ${m.region}` : ""}
                    {m.distance_km != null ? ` · ${m.distance_km} km` : ""}
                  </div>
                  {m.match_reasons.length > 0 && (
                    <div className="text-xs text-muted-foreground mt-1">{m.match_reasons.join(", ")}</div>
                  )}
                </div>
              </label>
            ))}
          </div>

          <div className="flex gap-2 text-xs">
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(filtered.map((m: any) => m.dealer_id)))}>
              Markera alla
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Avmarkera alla
            </Button>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Handlarkommentar (visas för handlare)</Label>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Visa följande för handlarna:</Label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={sharePhotos} onCheckedChange={(v) => setSharePhotos(!!v)} /> Godkända bilder
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={includePricing} onCheckedChange={(v) => setIncludePricing(!!v)} /> Värdering från–till (inte inpris/utpris)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={shareCity} onCheckedChange={(v) => setShareCity(!!v)} /> Visa kundens stad
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Avbryt</Button>
          <Button onClick={submit} disabled={saving || selected.size === 0}>
            {saving ? "Publicerar…" : `Publicera till ${selected.size} handlare`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
