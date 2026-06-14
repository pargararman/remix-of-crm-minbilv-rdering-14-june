// Pricing-historik-modal med CSV-export.
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { listPricingHistory } from "@/lib/pricing.functions";
import { formatDateTime } from "@/lib/format";

const sek = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 });
function fmtVal(field: string, v: string | null): string {
  if (v == null) return "(tom)";
  if (field === "pricing_notes") return v;
  const n = Number(v);
  return isNaN(n) ? v : `${sek.format(n)} kr`;
}

interface Props {
  leadId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function PricingHistoryModal({ leadId, open, onOpenChange }: Props) {
  const fetchFn = useServerFn(listPricingHistory);
  const q = useQuery({
    queryKey: ["pricing-history", leadId],
    queryFn: () => fetchFn({ data: { leadId } }),
    enabled: open,
  });

  function exportCsv() {
    if (!q.data) return;
    const rows = [["Datum", "Fält", "Tidigare", "Nytt", "Ändrad av"]];
    for (const h of q.data.history as any[]) {
      rows.push([
        formatDateTime(h.created_at),
        (q.data.labels as any)[h.field_name] ?? h.field_name,
        fmtVal(h.field_name, h.old_value),
        fmtVal(h.field_name, h.new_value),
        h.changer?.name ?? "",
      ]);
    }
    const csv = rows.map((r) => r.map((c) => `"${(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pricing-history-${leadId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pris-historik</DialogTitle>
        </DialogHeader>
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={exportCsv}>
            Exportera CSV
          </Button>
        </div>
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-2 py-2 font-medium">Datum</th>
              <th className="px-2 py-2 font-medium">Fält</th>
              <th className="px-2 py-2 font-medium">Tidigare</th>
              <th className="px-2 py-2 font-medium">Nytt</th>
              <th className="px-2 py-2 font-medium">Ändrad av</th>
            </tr>
          </thead>
          <tbody>
            {q.data?.history.length === 0 && (
              <tr>
                <td colSpan={5} className="px-2 py-6 text-center text-muted-foreground">
                  Ingen historik än.
                </td>
              </tr>
            )}
            {q.data?.history.map((h: any) => (
              <tr key={h.id} className="border-b border-border/50">
                <td className="px-2 py-2 text-muted-foreground tabular-nums">
                  {formatDateTime(h.created_at)}
                </td>
                <td className="px-2 py-2">{(q.data?.labels as any)[h.field_name] ?? h.field_name}</td>
                <td className="px-2 py-2 tabular-nums">{fmtVal(h.field_name, h.old_value)}</td>
                <td className="px-2 py-2 tabular-nums">{fmtVal(h.field_name, h.new_value)}</td>
                <td className="px-2 py-2">{h.changer?.name ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DialogContent>
    </Dialog>
  );
}
