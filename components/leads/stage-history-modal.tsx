// Stegförflyttningar-modal — historik per lead.
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { listStageTransitions } from "@/lib/pricing.functions";
import { formatDateTime } from "@/lib/format";

const TRIGGER_LABEL: Record<string, string> = {
  manual: "Manuell",
  auto_sms_outbound: "SMS skickat",
  auto_sms_inbound: "Kund svarade",
  auto_followup: "Schemalagd uppföljning",
  auto_call: "Samtal loggat",
  auto_intake: "Lead skapad",
  auto_pricing: "Pris satt",
  admin_override: "Admin",
};

interface Props {
  leadId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function StageHistoryModal({ leadId, open, onOpenChange }: Props) {
  const fetchFn = useServerFn(listStageTransitions);
  const q = useQuery({
    queryKey: ["stage-transitions", leadId],
    queryFn: () => fetchFn({ data: { leadId } }),
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Stegförflyttningar</DialogTitle>
        </DialogHeader>
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-2 py-2 font-medium">När</th>
              <th className="px-2 py-2 font-medium">Från</th>
              <th className="px-2 py-2 font-medium">Till</th>
              <th className="px-2 py-2 font-medium">Utlöst av</th>
              <th className="px-2 py-2 font-medium">Användare</th>
            </tr>
          </thead>
          <tbody>
            {q.data?.transitions.length === 0 && (
              <tr>
                <td colSpan={5} className="px-2 py-6 text-center text-muted-foreground">
                  Inga förflyttningar än.
                </td>
              </tr>
            )}
            {q.data?.transitions.map((t: any) => (
              <tr key={t.id} className="border-b border-border/50">
                <td className="px-2 py-2 text-muted-foreground tabular-nums">{formatDateTime(t.created_at)}</td>
                <td className="px-2 py-2">{t.from_stage ?? "—"}</td>
                <td className="px-2 py-2 font-medium">{t.to_stage}</td>
                <td className="px-2 py-2">{TRIGGER_LABEL[t.trigger_type] ?? t.trigger_type}</td>
                <td className="px-2 py-2">{t.actor?.name ?? "System"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DialogContent>
    </Dialog>
  );
}
