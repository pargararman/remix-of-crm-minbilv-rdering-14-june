// Samtalsloggningsmodal.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { logCall } from "@/lib/calls.functions";
import { formatPhone } from "@/lib/format";

const OUTCOMES: { value: "ringde" | "inget_svar" | "pratade" | "fel_nummer" | "ring_igen"; label: string }[] = [
  { value: "ringde", label: "Ringde" },
  { value: "inget_svar", label: "Inget svar" },
  { value: "pratade", label: "Pratade med kund" },
  { value: "fel_nummer", label: "Fel nummer" },
  { value: "ring_igen", label: "Ring igen senare" },
];

interface Props {
  leadId: string;
  phone: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onOpenChatWithMissedCall?: () => void;
}

export function LogCallModal({ leadId, phone, open, onOpenChange, onOpenChatWithMissedCall }: Props) {
  const qc = useQueryClient();
  const callFn = useServerFn(logCall);
  const [outcome, setOutcome] = useState<typeof OUTCOMES[number]["value"]>("pratade");
  const [summary, setSummary] = useState("");
  const [nextContact, setNextContact] = useState("");
  const [duration, setDuration] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await callFn({
        data: {
          leadId,
          outcome,
          summary: summary || undefined,
          nextContactAt: nextContact ? new Date(nextContact).toISOString() : undefined,
          durationSeconds: duration ? parseInt(duration, 10) : undefined,
        },
      });
      toast.success("Samtal loggat");
      if (nextContact) toast(`Påminnelse skapad för ${new Date(nextContact).toLocaleString("sv-SE")}`);
      qc.invalidateQueries({ queryKey: ["calls", leadId] });
      qc.invalidateQueries({ queryKey: ["timeline", leadId] });
      onOpenChange(false);
      if (outcome === "inget_svar" && onOpenChatWithMissedCall) {
        onOpenChatWithMissedCall();
      }
      // Reset
      setSummary("");
      setNextContact("");
      setDuration("");
      setOutcome("pratade");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte spara");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Logga samtal</DialogTitle>
          <a href={`tel:${phone}`} className="text-sm text-muted-foreground tabular-nums">
            {formatPhone(phone)}
          </a>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Utfall</Label>
            <RadioGroup value={outcome} onValueChange={(v) => setOutcome(v as any)} className="mt-2 space-y-1.5">
              {OUTCOMES.map((o) => (
                <label key={o.value} className="flex items-center gap-2 text-sm cursor-pointer">
                  <RadioGroupItem value={o.value} />
                  {o.label}
                </label>
              ))}
            </RadioGroup>
          </div>

          <div>
            <Label htmlFor="summary" className="text-xs uppercase tracking-wide text-muted-foreground">
              Samtalsanteckning
            </Label>
            <Textarea
              id="summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Vad sa kunden?"
              rows={3}
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="next" className="text-xs uppercase tracking-wide text-muted-foreground">
                Nästa kontakt
              </Label>
              <Input
                id="next"
                type="datetime-local"
                value={nextContact}
                onChange={(e) => setNextContact(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="dur" className="text-xs uppercase tracking-wide text-muted-foreground">
                Längd (sek)
              </Label>
              <Input
                id="dur"
                type="number"
                min={0}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Sparar…" : "Spara"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
