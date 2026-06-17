import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { createGdprRequest, listGdprRequests, processGdprRequest } from "@/lib/gdpr.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Shield, ShieldAlert, ShieldCheck } from "lucide-react";
import { formatRelative } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/gdpr")({
  component: GdprPage,
});

function GdprPage() {
  const create = useServerFn(createGdprRequest);
  const list = useServerFn(listGdprRequests);
  const process = useServerFn(processGdprRequest);
  const qc = useQueryClient();

  const [type, setType] = useState<"access" | "deletion" | "rectification">("access");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");

  const { data: requests, isLoading } = useQuery({
    queryKey: ["gdpr-list"],
    queryFn: () => list(),
  });

  const createMut = useMutation({
    mutationFn: () => create({ data: { request_type: type, customer_phone: phone || null, customer_email: email || null, notes: notes || null } }),
    onSuccess: (r) => {
      toast.success(`Begäran skapad — ${r.matched_lead_ids?.length ?? 0} matchande leads`);
      setPhone(""); setEmail(""); setNotes("");
      qc.invalidateQueries({ queryKey: ["gdpr-list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const processMut = useMutation({
    mutationFn: (vars: { id: string; action: "mark_processed" | "anonymize" | "reject" }) =>
      process({ data: { id: vars.id, action: vars.action, notes: null } }),
    onSuccess: () => {
      toast.success("Uppdaterad");
      qc.invalidateQueries({ queryKey: ["gdpr-list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <Shield className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-semibold">GDPR-verktyg</h1>
      </div>

      <div className="p-4 rounded-md bg-elevated border border-border space-y-3">
        <h2 className="font-medium">Ny begäran</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Typ</Label>
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="access">Tillgång (export)</SelectItem>
                <SelectItem value="deletion">Radering / anonymisering</SelectItem>
                <SelectItem value="rectification">Rättelse</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Telefon</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+46…" />
          </div>
          <div>
            <Label className="text-xs">E-post</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="kund@…" />
          </div>
        </div>
        <div>
          <Label className="text-xs">Anteckning</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
        <Button onClick={() => createMut.mutate()} disabled={createMut.isPending || (!phone && !email)}>
          Skapa begäran
        </Button>
      </div>

      <div className="space-y-2">
        <h2 className="font-medium">Senaste begäranden</h2>
        {isLoading ? (
          <div className="text-muted-foreground">Laddar…</div>
        ) : (requests ?? []).length === 0 ? (
          <div className="text-muted-foreground p-6 text-center border border-dashed rounded-md">Inga begäranden ännu</div>
        ) : (
          <div className="space-y-2">
            {requests!.map((r) => (
              <div key={r.id} className="p-3 rounded-md border border-border bg-elevated">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{r.request_type}</Badge>
                    <Badge variant={r.status === "processed" ? "default" : r.status === "rejected" ? "destructive" : "secondary"}>
                      {r.status}
                    </Badge>
                    <span className="text-sm text-muted-foreground">{formatRelative(r.created_at)}</span>
                  </div>
                  {r.status === "pending" && (
                    <div className="flex gap-2">
                      {r.request_type === "deletion" && (
                        <Button size="sm" variant="destructive" onClick={() => processMut.mutate({ id: r.id, action: "anonymize" })}>
                          <ShieldAlert className="h-4 w-4 mr-1" />
                          Anonymisera
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => processMut.mutate({ id: r.id, action: "mark_processed" })}>
                        <ShieldCheck className="h-4 w-4 mr-1" />
                        Markera utförd
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => processMut.mutate({ id: r.id, action: "reject" })}>
                        Avvisa
                      </Button>
                    </div>
                  )}
                </div>
                <div className="text-sm mt-2 space-y-1">
                  {r.customer_phone && <div>Tel: {r.customer_phone}</div>}
                  {r.customer_email && <div>E-post: {r.customer_email}</div>}
                  <div className="text-muted-foreground">Matchande leads: {r.matched_lead_ids?.length ?? 0}</div>
                  {r.notes && <div className="text-muted-foreground">{r.notes}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
