import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { listAllTemplates, updateSmsTemplate, previewTemplate } from "@/lib/templates.functions";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/settings/sms-templates")({
  head: () => ({ meta: [{ title: "SMS-mallar — Admin" }] }),
  component: TemplatesPage,
});

function TemplatesPage() {
  const fetchAll = useServerFn(listAllTemplates);
  const q = useQuery({ queryKey: ["all-templates"], queryFn: () => fetchAll() });
  const [editing, setEditing] = useState<{
    id: string;
    code: string;
    label_sv: string;
    body_sv: string;
    is_active: boolean;
  } | null>(null);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">SMS-mallar</h1>
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Etikett</th>
                <th className="px-4 py-2 font-medium">Kod</th>
                <th className="px-4 py-2 font-medium">Innehåll</th>
                <th className="px-4 py-2 font-medium">Aktiv</th>
                <th className="px-4 py-2 font-medium">Senast ändrad</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {q.data?.templates.map((t: any) => (
                <tr key={t.id} className="border-b border-border/50">
                  <td className="px-4 py-2">{t.label_sv}</td>
                  <td className="px-4 py-2 font-mono text-xs">{t.code}</td>
                  <td className="px-4 py-2 max-w-md truncate text-muted-foreground">
                    {t.body_sv}
                  </td>
                  <td className="px-4 py-2">
                    {t.is_active ? <Badge>Aktiv</Badge> : <Badge variant="outline">Av</Badge>}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground text-xs">
                    {formatDateTime(t.updated_at)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Button size="sm" variant="outline" onClick={() => setEditing(t)}>
                      Redigera
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      {editing && <EditDialog template={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

const PLACEHOLDERS = [
  ["{KUNDNAMN}", "kundens förnamn"],
  ["{REGNR}", "registreringsnummer"],
  ["{VARDERING_FRAN}", "lägre värderingsspann"],
  ["{VARDERING_TILL}", "högre värderingsspann"],
  ["{SUMMA}", "lämnas som ___"],
];

function EditDialog({ template, onClose }: { template: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [label, setLabel] = useState(template.label_sv);
  const [body, setBody] = useState(template.body_sv);
  const [active, setActive] = useState<boolean>(template.is_active);
  const [previewText, setPreviewText] = useState("");
  const [saving, setSaving] = useState(false);
  const updateFn = useServerFn(updateSmsTemplate);
  const previewFn = useServerFn(previewTemplate);

  async function refreshPreview() {
    const { body: out } = await previewFn({
      data: { templateCode: template.code, rawBody: body },
    });
    setPreviewText(out);
  }

  async function save() {
    if (!body.trim() || body.length > 1600) {
      toast.error("Innehåll måste vara 1–1600 tecken");
      return;
    }
    setSaving(true);
    try {
      await updateFn({
        data: { code: template.code, body_sv: body, label_sv: label, is_active: active },
      });
      toast.success("Mall sparad");
      qc.invalidateQueries({ queryKey: ["all-templates"] });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte spara");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Redigera mall: {template.label_sv}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Etikett</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={100} />
          </div>
          <div className="flex items-center gap-2">
            <Label>Kod</Label>
            <span className="font-mono text-sm text-muted-foreground">{template.code}</span>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={active} onCheckedChange={setActive} id="active" />
            <Label htmlFor="active">Aktiv</Label>
          </div>
          <div>
            <Label>Innehåll</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, 1600))}
              rows={6}
              onBlur={refreshPreview}
            />
            <div className="text-xs text-muted-foreground mt-1">{body.length} / 1600</div>
          </div>
          <div className="text-xs text-muted-foreground">
            <div className="mb-1 font-medium">Tillgängliga platshållare:</div>
            <ul className="space-y-0.5 font-mono">
              {PLACEHOLDERS.map(([k, d]) => (
                <li key={k}>
                  <span className="text-foreground">{k}</span> — {d}
                </li>
              ))}
            </ul>
          </div>
          {previewText && (
            <Card>
              <CardContent className="p-3 text-sm whitespace-pre-wrap">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                  Förhandsgranskning
                </div>
                {previewText}
              </CardContent>
            </Card>
          )}
          <Button variant="outline" size="sm" onClick={refreshPreview}>
            Förhandsgranska
          </Button>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Avbryt
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Sparar…" : "Spara"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
