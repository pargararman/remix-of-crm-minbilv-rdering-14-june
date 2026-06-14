// Mark lead as lost modal.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { markLeadLost } from "@/lib/lost.functions";
import { LOST_REASONS } from "@/lib/lost-reasons";

export function MarkLostModal({ leadId, open, onOpenChange, onSuccess }: {
  leadId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess?: () => void;
}) {
  const fn = useServerFn(markLeadLost);
  const qc = useQueryClient();
  const [reason, setReason] = useState<string>("inget_svar");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Markera som förlorad</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-sm">Varför är denna lead förlorad?</Label>
            <div className="space-y-1">
              {LOST_REASONS.map((r) => (
                <label key={r.value} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name="reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} />
                  {r.label}
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Kommentar (valfri)</Label>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Avbryt</Button>
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await fn({ data: { leadId, lost_reason_code: reason as any, lost_reason_text: text || null } });
                qc.invalidateQueries({ queryKey: ["lead-detail", leadId] });
                onSuccess?.();
                onOpenChange(false);
              } catch (e: any) {
                alert(e.message ?? "Fel");
              } finally { setSaving(false); }
            }}
          >Markera som förlorad</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
