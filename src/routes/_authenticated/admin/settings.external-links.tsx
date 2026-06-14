import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { getCompanySettings, updateExternalLinks } from "@/lib/settings.functions";

const DEFAULT_CAR_INFO = "https://www.car.info/sv-se/license-plate/S/{REGNR}";
const DEFAULT_BILUPPGIFTER = "https://biluppgifter.se/fordon/{REGNR}";
const DEFAULT_BLOCKET =
  "https://www.blocket.se/mobility/search/car?q={Q}&year_from={YEAR_FROM}&year_to={YEAR_TO}&mileage_from={MILEAGE_FROM}&mileage_to={MILEAGE_TO}";

export const Route = createFileRoute("/_authenticated/admin/settings/external-links")({
  head: () => ({ meta: [{ title: "Externa länkar — Admin" }] }),
  component: ExternalLinksPage,
});

function ExternalLinksPage() {
  const fetchFn = useServerFn(getCompanySettings);
  const updateFn = useServerFn(updateExternalLinks);
  const q = useQuery({ queryKey: ["company-settings"], queryFn: () => fetchFn() });
  const [carInfo, setCarInfo] = useState("");
  const [biluppgifter, setBiluppgifter] = useState("");
  const [blocket, setBlocket] = useState("");
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    if (q.data?.settings) {
      const s = q.data.settings as any;
      setId(s.id);
      setCarInfo(s.car_info_url_pattern ?? DEFAULT_CAR_INFO);
      setBiluppgifter(s.biluppgifter_url_pattern ?? DEFAULT_BILUPPGIFTER);
      setBlocket(s.blocket_url_pattern ?? DEFAULT_BLOCKET);
    }
  }, [q.data]);

  async function save() {
    if (!id) return;
    if (!carInfo.includes("{REGNR}")) { toast.error("car.info-mönstret måste innehålla {REGNR}"); return; }
    if (!biluppgifter.includes("{REGNR}")) { toast.error("biluppgifter-mönstret måste innehålla {REGNR}"); return; }
    try {
      await updateFn({ data: { id, car_info_url_pattern: carInfo, biluppgifter_url_pattern: biluppgifter, blocket_url_pattern: blocket || null } });
      toast.success("Sparat");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte spara");
    }
  }

  function reset() {
    setCarInfo(DEFAULT_CAR_INFO);
    setBiluppgifter(DEFAULT_BILUPPGIFTER);
    setBlocket(DEFAULT_BLOCKET);
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-xl font-semibold">Externa länkar</h1>
      <Card>
        <CardContent className="p-5 space-y-5">
          <div className="space-y-1.5">
            <Label>car.info URL-mönster</Label>
            <Input value={carInfo} onChange={(e) => setCarInfo(e.target.value)} />
            <p className="text-xs text-muted-foreground">Måste innehålla {"{REGNR}"}.</p>
          </div>
          <div className="space-y-1.5">
            <Label>biluppgifter.se URL-mönster</Label>
            <Input value={biluppgifter} onChange={(e) => setBiluppgifter(e.target.value)} />
            <p className="text-xs text-muted-foreground">Måste innehålla {"{REGNR}"}.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Blocket URL-mönster</Label>
            <Input value={blocket} onChange={(e) => setBlocket(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Tillgängliga tokens: {"{Q} = fritext-söksträng (märke, modell, drivmedel m.m.), {YEAR_FROM}, {YEAR_TO}, {MILEAGE_FROM}, {MILEAGE_TO}"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={reset}>Återställ till standard</Button>
            <Button onClick={save}>Spara</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
