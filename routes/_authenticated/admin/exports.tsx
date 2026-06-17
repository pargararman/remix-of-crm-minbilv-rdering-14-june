import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { generateExcelExport } from "@/lib/exports.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Download, FileSpreadsheet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/exports")({
  component: ExportsPage,
});

type Entity = "leads" | "billing" | "audit" | "dealers" | "won_deals";

function ExportsPage() {
  const exporter = useServerFn(generateExcelExport);
  const [entity, setEntity] = useState<Entity>("leads");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const mut = useMutation({
    mutationFn: () =>
      exporter({
        data: {
          entity,
          fromDate: fromDate || null,
          toDate: toDate ? new Date(toDate + "T23:59:59").toISOString() : null,
        },
      }),
    onSuccess: (r) => {
      const bin = atob(r.base64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const blob = new Blob([arr], { type: r.mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exporterade ${r.rows} rader`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <FileSpreadsheet className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-semibold">Excel-export</h1>
      </div>

      <div className="p-4 rounded-md bg-elevated border border-border space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Innehåll</Label>
            <Select value={entity} onValueChange={(v) => setEntity(v as Entity)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="leads">Leads</SelectItem>
                <SelectItem value="billing">Fakturering</SelectItem>
                <SelectItem value="audit">Audit-logg</SelectItem>
                <SelectItem value="dealers">Handlare</SelectItem>
                <SelectItem value="won_deals">Vunna affärer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Från (valfritt)</Label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Till (valfritt)</Label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
        </div>
        <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
          <Download className="h-4 w-4 mr-2" />
          {mut.isPending ? "Genererar…" : "Ladda ner Excel"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Max 10 000 rader per export. Exporten loggas i audit-loggen.
        </p>
      </div>
    </div>
  );
}
