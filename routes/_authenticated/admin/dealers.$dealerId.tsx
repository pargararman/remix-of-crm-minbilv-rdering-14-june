// Admin: skapa / redigera handlare + bjuda in användare.
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Trash2, UserPlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  getDealer,
  upsertDealer,
  inviteDealerUser,
  removeDealerUser,
} from "@/lib/dealers.functions";
import { AccountActions } from "@/components/admin/account-actions";
import { CreateDealerUserDialog } from "@/components/admin/create-dealer-user-dialog";

export const Route = createFileRoute("/_authenticated/admin/dealers/$dealerId")({
  head: () => ({ meta: [{ title: "Handlare — Min Bil Värdering" }] }),
  component: DealerEdit,
});

const EMPTY: any = {
  company_name: "",
  email: "",
  city: "",
  buying_radius_km: 50,
  preferred_brands: [],
  preferred_vehicle_types: [],
  preferred_fuels: [],
  notify_via_email: true,
  notify_via_sms: false,
  notify_only_preferred_brands: false,
  notify_only_within_radius: true,
  pricing_model: "per_lead",
  status: "active",
};

function DealerEdit() {
  const { dealerId } = Route.useParams();
  const isNew = dealerId === "new";
  const nav = useNavigate();
  const qc = useQueryClient();
  const getFn = useServerFn(getDealer);
  const saveFn = useServerFn(upsertDealer);
  const inviteFn = useServerFn(inviteDealerUser);
  const removeFn = useServerFn(removeDealerUser);

  const q = useQuery({
    queryKey: ["dealer", dealerId],
    queryFn: () => getFn({ data: { dealerId } }),
    enabled: !isNew,
  });

  const [form, setForm] = useState<any>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");

  useEffect(() => {
    if (q.data?.dealer) setForm(q.data.dealer);
  }, [q.data]);

  const update = (patch: Partial<any>) => setForm({ ...form, ...patch });
  const csv = (arr: any[] | null) => (arr ?? []).join(", ");
  const parseCsv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

  const save = async () => {
    setSaving(true);
    try {
      const payload: any = { ...form };
      // Coerce numbers
      ["buying_radius_km","max_mileage_mil","min_year","price_range_from","price_range_to","price_per_lead","price_per_won_deal","monthly_fee"].forEach((k) => {
        if (payload[k] === "" || payload[k] == null) payload[k] = null;
        else payload[k] = Number(payload[k]);
      });
      const res = await saveFn({ data: { id: isNew ? null : dealerId, data: payload } });
      toast.success("Sparat");
      if (isNew && (res as any).dealer?.id) {
        nav({ to: "/admin/dealers/$dealerId", params: { dealerId: (res as any).dealer.id } });
      } else {
        qc.invalidateQueries({ queryKey: ["dealer", dealerId] });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte spara");
    } finally {
      setSaving(false);
    }
  };

  const invite = async () => {
    if (!inviteEmail.trim()) return;
    try {
      await inviteFn({ data: { dealerId, email: inviteEmail.trim() } });
      toast.success("Inbjudan skickad");
      setInviteEmail("");
      qc.invalidateQueries({ queryKey: ["dealer", dealerId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte bjuda in");
    }
  };

  const removeUser = async (userId: string) => {
    if (!confirm("Ta bort användaren från handlaren?")) return;
    await removeFn({ data: { userId } });
    qc.invalidateQueries({ queryKey: ["dealer", dealerId] });
  };

  if (!isNew && q.isLoading) return <p className="text-muted-foreground">Laddar…</p>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/dealers"><ArrowLeft className="h-4 w-4 mr-1" /> Tillbaka</Link>
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">
          {isNew ? "Ny handlare" : form.company_name || "Handlare"}
        </h1>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Företagsuppgifter</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label="Företagsnamn *"><Input value={form.company_name ?? ""} onChange={(e) => update({ company_name: e.target.value })} /></Field>
          <Field label="Organisationsnummer"><Input value={form.org_number ?? ""} onChange={(e) => update({ org_number: e.target.value })} /></Field>
          <Field label="Kontaktperson"><Input value={form.contact_person ?? ""} onChange={(e) => update({ contact_person: e.target.value })} /></Field>
          <Field label="E-post *"><Input type="email" value={form.email ?? ""} onChange={(e) => update({ email: e.target.value })} /></Field>
          <Field label="Telefon"><Input value={form.phone ?? ""} onChange={(e) => update({ phone: e.target.value })} /></Field>
          <Field label="Adress"><Input value={form.address ?? ""} onChange={(e) => update({ address: e.target.value })} /></Field>
          <Field label="Postnummer"><Input value={form.postal_code ?? ""} onChange={(e) => update({ postal_code: e.target.value })} /></Field>
          <Field label="Ort *"><Input value={form.city ?? ""} onChange={(e) => update({ city: e.target.value })} /></Field>
          <Field label="Region"><Input value={form.region ?? ""} onChange={(e) => update({ region: e.target.value })} /></Field>
          <Field label="Status">
            <Select value={form.status ?? "active"} onValueChange={(v) => update({ status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Aktiv</SelectItem>
                <SelectItem value="paused">Pausad</SelectItem>
                <SelectItem value="inactive">Inaktiv</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Köpkriterier</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label="Köpradie (km)">
            <Input type="number" value={form.buying_radius_km ?? 50} onChange={(e) => update({ buying_radius_km: Number(e.target.value) || 0 })} />
          </Field>
          <Field label="Max miltal">
            <Input type="number" value={form.max_mileage_mil ?? ""} onChange={(e) => update({ max_mileage_mil: e.target.value })} />
          </Field>
          <Field label="Minsta årsmodell">
            <Input type="number" value={form.min_year ?? ""} onChange={(e) => update({ min_year: e.target.value })} />
          </Field>
          <Field label="Pris från (kr)">
            <Input type="number" value={form.price_range_from ?? ""} onChange={(e) => update({ price_range_from: e.target.value })} />
          </Field>
          <Field label="Pris till (kr)">
            <Input type="number" value={form.price_range_to ?? ""} onChange={(e) => update({ price_range_to: e.target.value })} />
          </Field>
          <Field label="Föredragna märken (kommaseparerat)">
            <Input value={csv(form.preferred_brands)} onChange={(e) => update({ preferred_brands: parseCsv(e.target.value) })} />
          </Field>
          <Field label="Karosstyper (kommaseparerat)">
            <Input value={csv(form.preferred_vehicle_types)} onChange={(e) => update({ preferred_vehicle_types: parseCsv(e.target.value) })} />
          </Field>
          <Field label="Drivmedel (bensin,diesel,hybrid,plugin_hybrid,electric,gas,ethanol,other)">
            <Input value={csv(form.preferred_fuels)} onChange={(e) => update({ preferred_fuels: parseCsv(e.target.value) })} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Notiser</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Toggle label="Notiser via e-post" checked={!!form.notify_via_email} onChange={(v) => update({ notify_via_email: v })} />
          <Toggle label="Notiser via SMS" checked={!!form.notify_via_sms} onChange={(v) => update({ notify_via_sms: v })} />
          <Toggle label="Bara föredragna märken" checked={!!form.notify_only_preferred_brands} onChange={(v) => update({ notify_only_preferred_brands: v })} />
          <Toggle label="Bara inom köpradie" checked={!!form.notify_only_within_radius} onChange={(v) => update({ notify_only_within_radius: v })} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Prismodell</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label="Modell">
            <Select value={form.pricing_model ?? "per_lead"} onValueChange={(v) => update({ pricing_model: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="per_lead">Per lead</SelectItem>
                <SelectItem value="per_won_deal">Per vunnen affär</SelectItem>
                <SelectItem value="monthly_fee">Månadsavgift</SelectItem>
                <SelectItem value="custom">Anpassad</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Pris per lead (kr)"><Input type="number" value={form.price_per_lead ?? ""} onChange={(e) => update({ price_per_lead: e.target.value })} /></Field>
          <Field label="Pris per vunnen affär (kr)"><Input type="number" value={form.price_per_won_deal ?? ""} onChange={(e) => update({ price_per_won_deal: e.target.value })} /></Field>
          <Field label="Månadsavgift (kr)"><Input type="number" value={form.monthly_fee ?? ""} onChange={(e) => update({ monthly_fee: e.target.value })} /></Field>
          <div className="sm:col-span-2">
            <Label className="text-xs">Anpassade villkor</Label>
            <Textarea value={form.custom_terms ?? ""} rows={3} onChange={(e) => update({ custom_terms: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Interna anteckningar</Label>
            <Textarea value={form.internal_notes ?? ""} rows={3} onChange={(e) => update({ internal_notes: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button onClick={save} disabled={saving}>{saving ? "Sparar…" : "Spara"}</Button>
      </div>

      {!isNew && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Portalkonto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1 divide-y">
              {(q.data?.users ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">Inga portalanvändare ännu.</p>
              )}
              {(q.data?.users ?? []).map((u: any) => (
                <div key={u.user_id} className="flex items-center justify-between gap-3 py-2">
                  <div className="text-sm min-w-0">
                    <div className="truncate">
                      {u.email ?? u.user_id}{" "}
                      {u.is_primary && <Badge variant="secondary" className="ml-2">Primär</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Senast inloggad:{" "}
                      {u.last_login_at
                        ? new Date(u.last_login_at).toLocaleString("sv-SE")
                        : "Aldrig"}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <AccountActions
                      userId={u.user_id}
                      email={u.email}
                      invalidateKeys={[["dealer", dealerId], ["account-overview"]]}
                    />
                    <Button size="sm" variant="ghost" onClick={() => removeUser(u.user_id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2 pt-3 border-t">
              <Label className="text-xs">Bjud in via e-post (magisk länk)</Label>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="ny.anvandare@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
                <Button onClick={invite} disabled={!inviteEmail.trim()}>
                  <UserPlus className="h-4 w-4 mr-1" /> Bjud in
                </Button>
              </div>
            </div>

            <div className="space-y-2 pt-3 border-t">
              <Label className="text-xs">Skapa konto direkt med startlösenord</Label>
              <CreateDealerUserDialog
                dealers={[]}
                fixedDealerId={dealerId}
                triggerLabel="Skapa konto direkt"
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-sm">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
