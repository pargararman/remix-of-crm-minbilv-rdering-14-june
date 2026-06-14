// Externa knappar: car.info + biluppgifter + Blocket-värdering.
import { useServerFn } from "@tanstack/react-start";
import { logAuditAction } from "@/lib/settings.functions";
import { ExternalLinkLogoButton } from "./external-link-logo-button";
import {
  buildCarInfoUrl,
  buildBlocketUrl,
  buildBiluppgifterUrl,
  blocketReady,
  type VehicleLike,
} from "@/lib/external-links";

interface Props {
  leadId: string;
  regnr: string | null;
  vehicle: VehicleLike | null;
  carInfoPattern?: string | null;
  blocketPattern?: string | null;
  biluppgifterPattern?: string | null;
}

export function ExternalButtons({ leadId, regnr, vehicle, carInfoPattern, blocketPattern, biluppgifterPattern }: Props) {
  const audit = useServerFn(logAuditAction);
  const carInfoUrl = buildCarInfoUrl(regnr, carInfoPattern);
  const biluppgifterUrl = buildBiluppgifterUrl(regnr, biluppgifterPattern);
  const blocketUrl = buildBlocketUrl(vehicle, blocketPattern);
  const ready = blocketReady(vehicle);

  return (
    <div className="flex flex-wrap gap-2">
      <ExternalLinkLogoButton type="car_info" href={carInfoUrl}
        disabledReason={!regnr ? "Inget registreringsnummer" : undefined}
        onClick={() => { audit({ data: { action: "car_info_opened", leadId } }).catch(() => {}); }}
        ariaLabel={`Öppna car.info${regnr ? ` för ${regnr}` : ""}`} />
      <ExternalLinkLogoButton type="biluppgifter" href={biluppgifterUrl}
        disabledReason={!regnr ? "Inget registreringsnummer" : undefined}
        onClick={() => { audit({ data: { action: "biluppgifter_opened", leadId } }).catch(() => {}); }}
        ariaLabel={`Öppna biluppgifter.se${regnr ? ` för ${regnr}` : ""}`} />
      <ExternalLinkLogoButton type="blocket" href={blocketUrl}
        disabledReason={!ready ? "Fyll i märke, modell, år och miltal först" : undefined}
        onClick={() => { audit({ data: { action: "blocket_opened", leadId } }).catch(() => {}); }}
        ariaLabel={`Öppna Blocket-sökning${vehicle?.brand ? ` för ${vehicle.brand} ${vehicle.model ?? ""}` : ""}`} />
    </div>
  );
}
