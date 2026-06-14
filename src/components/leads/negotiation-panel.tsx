// Negotiation log panel.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { listNegotiation, addNegotiationEntry } from "@/lib/negotiation.functions";
import { formatDateTime } from "@/lib/format";

const ACTOR_LABEL: Record<string, string> = { customer: "Kund", seller: "Säljare", dealer: "Handlare" };
const ACTOR_COLOR: Record<string, string> = {
  customer: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  seller: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  dealer: "bg-purple-500/15 text-purple-400 border-purple-500/30",
};

export function NegotiationPanel({ leadId }: { leadId: string }) {
  const listFn = useServerFn(listNegotiation);
  const addFn = useServerFn(addNegotiationEntry);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["negotiation", leadId],
    queryFn: () => listFn({ data: { leadId } }),
  });
  const [open, setOpen] = useState(false);
  const [actor, setActor] = useState<"customer" | "seller" | "dealer">("customer");
  const [amount, setAmount] = useState("");
  const [comment, setComment] = useState("");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Förhandlingslogg</h3>
        <Button size="sm" onClick={() => setOpen(!open)}>
          <Plus className="h-4 w-4 mr-1" /> Lägg till händelse
        </Button>
      </div>
      {open && (
        <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
          <div className="space-y-1">
            <Label className="text-xs">Aktör</Label>
            <div className="flex gap-2">
              {(["customer", "seller", "dealer"] as const).map((a) => (
                <button
                  key={a}
                  className={`text-xs px-3 py-1 rounded border ${actor === a ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}
                  onClick={() => setActor(a)}
                >
                  {ACTOR_LABEL[a]}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Belopp (kr, valfritt)</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Kommentar</Label>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={async () => {
                await addFn({
                  data: {
                    leadId,
                    actor_type: actor,
                    amount: amount ? parseInt(amount, 10) : null,
                    comment: comment || null,
                  },
                });
                setAmount(""); setComment(""); setOpen(false);
                qc.invalidateQueries({ queryKey: ["negotiation", leadId] });
              }}
            >
              Spara
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Avbryt</Button>
          </div>
        </div>
      )}
      <div className="space-y-2">
        {q.data?.entries.length === 0 && <p className="text-sm text-muted-foreground">Inga förhandlingsposter.</p>}
        {q.data?.entries.map((e: any) => (
          <div key={e.id} className="flex items-start gap-3 border-l-2 border-border pl-3 py-1">
            <span className={`text-xs px-2 py-0.5 rounded border ${ACTOR_COLOR[e.actor_type]}`}>
              {ACTOR_LABEL[e.actor_type]}
            </span>
            {e.amount != null && (
              <span className="text-sm font-mono font-semibold">{e.amount.toLocaleString("sv-SE")} kr</span>
            )}
            <div className="flex-1 text-sm">
              {e.comment && <div>{e.comment}</div>}
              <div className="text-xs text-muted-foreground">{formatDateTime(e.created_at)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
