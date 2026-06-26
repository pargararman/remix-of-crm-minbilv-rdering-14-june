import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { createLead } from "@/lib/leads.functions";
import { RouteError, RoutePending } from "@/components/route-boundaries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Loader2 } from "lucide-react";
import { BrandCombobox } from "@/components/leads/brand-combobox";
import { FUEL_OPTIONS, GEARBOX_OPTIONS } from "@/lib/vehicle-enums";

export const Route = createFileRoute("/_authenticated/leads/ny")({
  head: () => ({ meta: [{ title: "Nytt lead — Min Bil Värdering" }] }),
  component: NewLeadPage,
  pendingComponent: RoutePending,
  errorComponent: RouteError,
});

type FuelOption = (typeof FUEL_OPTIONS)[number]["value"];
type GearboxOption = (typeof GEARBOX_OPTIONS)[number]["value"];

const DRAFT_KEY = "lead-draft:v1";

const EMPTY_FORM = {
  customer_name: "",
  phone: "",
  email: "",
  registration_number: "",
  city: "",
  free_text: "",
  gdpr_consent: false,
  brand: "",
  model: "",
  year: "",
  mileage_mil: "",
  fuel: "" as FuelOption | "",
  gearbox: "" as GearboxOption | "",
};

function NewLeadPage() {
  const navigate = useNavigate();
  const createFn = useServerFn(createLead);
  const [loading, setLoading] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);

  const [form, setForm] = useState(EMPTY_FORM);

  // Återställ utkast från localStorage på mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        setForm({ ...EMPTY_FORM, ...parsed });
        setDraftRestored(true);
      }
    } catch {
      // ignorera trasig JSON
    }
  }, []);

  // Debounced auto-save (500ms) av hela formuläret.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
      } catch {
        // localStorage kan vara full / disabled — ignorera
      }
    }, 500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [form]);

  const clearDraft = () => {
    if (typeof window !== "undefined") window.localStorage.removeItem(DRAFT_KEY);
    setForm(EMPTY_FORM);
    setDraftRestored(false);
    toast.success("Utkast rensat");
  };

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.phone || !form.email || !form.registration_number) {
      toast.error("Telefon, e-post och regnr är obligatoriska");
      return;
    }
    setLoading(true);
    try {
      const res = await createFn({
        data: {
          customer_name: form.customer_name || null,
          phone: form.phone,
          email: form.email,
          registration_number: form.registration_number,
          city: form.city || null,
          free_text: form.free_text || null,
          gdpr_consent: form.gdpr_consent,
          vehicle: {
            brand: form.brand || null,
            model: form.model || null,
            year: form.year ? Number(form.year) : null,
            mileage_mil: form.mileage_mil ? Number(form.mileage_mil) : null,
            fuel: (form.fuel || null) as FuelOption | null,
            gearbox: (form.gearbox || null) as GearboxOption | null,
          },
        },
      });
      // Rensa utkast efter lyckad submit.
      if (typeof window !== "undefined") window.localStorage.removeItem(DRAFT_KEY);
      toast.success("Lead skapat");
      navigate({ to: "/leads/$leadId", params: { leadId: res.leadId } });
    } catch (err: any) {
      toast.error(err?.message ?? "Kunde inte skapa lead");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/">
            <ArrowLeft className="mr-1 h-4 w-4" /> Tillbaka
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Skapa lead manuellt</h1>
      </div>

      {draftRestored && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-elevated px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            Utkast återställt från din senaste session.
          </span>
          <Button type="button" size="sm" variant="ghost" onClick={clearDraft}>
            Rensa utkast
          </Button>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Kund</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="customer_name">Namn</Label>
              <Input
                id="customer_name"
                value={form.customer_name}
                onChange={(e) => set("customer_name", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Telefon *</Label>
              <Input
                id="phone"
                required
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="+46701234567"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">E-post *</Label>
              <Input
                id="email"
                type="email"
                required
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="city">Stad</Label>
              <Input
                id="city"
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fordon</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="regnr">Regnr *</Label>
              <Input
                id="regnr"
                required
                value={form.registration_number}
                onChange={(e) => set("registration_number", e.target.value.toUpperCase())}
                placeholder="ABC123"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brand">Märke</Label>
              <BrandCombobox
                id="brand"
                hideLabel
                value={form.brand}
                onChange={(v) => set("brand", v ?? "")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="model">Modell</Label>
              <Input
                id="model"
                value={form.model}
                onChange={(e) => set("model", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="year">Årsmodell</Label>
              <Input
                id="year"
                type="number"
                min={1900}
                max={2100}
                value={form.year}
                onChange={(e) => set("year", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mileage">Miltal</Label>
              <Input
                id="mileage"
                type="number"
                min={0}
                value={form.mileage_mil}
                onChange={(e) => set("mileage_mil", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Bränsle</Label>
              <Select
                value={form.fuel}
                onValueChange={(v) => set("fuel", v as FuelOption)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Välj bränsle" />
                </SelectTrigger>
                <SelectContent>
                  {FUEL_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Växellåda</Label>
              <Select
                value={form.gearbox}
                onValueChange={(v) => set("gearbox", v as GearboxOption)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Välj" />
                </SelectTrigger>
                <SelectContent>
                  {GEARBOX_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Övrigt</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="free_text">Anteckning / fritext</Label>
              <Textarea
                id="free_text"
                rows={3}
                value={form.free_text}
                onChange={(e) => set("free_text", e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="gdpr"
                checked={form.gdpr_consent}
                onCheckedChange={(v) => set("gdpr_consent", v === true)}
              />
              <Label htmlFor="gdpr" className="cursor-pointer">
                Kund har lämnat GDPR-samtycke
              </Label>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" asChild>
            <Link to="/">Avbryt</Link>
          </Button>
          <Button type="submit" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Skapa lead
          </Button>
        </div>
      </form>
    </div>
  );
}
