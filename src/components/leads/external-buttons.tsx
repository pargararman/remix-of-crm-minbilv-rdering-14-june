// Externa knappar: car.info + biluppgifter + Blocket API-värdering + Blocket-sökning.
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
import { blocketMissingFieldsText } from "@/lib/valuation/vehicle-validation";

interface Props {
  leadId: string;
  regnr: string | null;
  vehicle: VehicleLike | null;
  carInfoPattern?: string | null;
  blocketPattern?: string | null;
  biluppgifterPattern?: string | null;
  /**
   * When provided, show a separate Blocket API button that triggers the in-app
   * server-side valuation. The yellow Blocket.se link remains visible so the
   * user can manually verify the comparable search in Blocket.
   */
  onBlocketValuate?: () => void;
  /** Shows a spinner state on the Blocket API button while the API call runs. */
  blocketPending?: boolean;
}

export function ExternalButtons({ leadId, regnr, vehicle, carInfoPattern, blocketPattern, biluppgifterPattern, onBlocketValuate, blocketPending }: Props) {
  const audit = useServerFn(logAuditAction);
  const carInfoUrl = buildCarInfoUrl(regnr, carInfoPattern);
  const biluppgifterUrl = buildBiluppgifterUrl(regnr, biluppgifterPattern);
  const blocketUrl = buildBlocketUrl(vehicle, blocketPattern);
  const ready = blocketReady(vehicle);
  const blocketDisabledReason = ready ? undefined : blocketMissingFieldsText(vehicle);
  const apiMode = typeof onBlocketValuate === "function";

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
      {apiMode && (
        <ExternalLinkLogoButton type="blocket" asButton pending={blocketPending}
          label="Blocket API"
          tone="api"
          disabledReason={blocketDisabledReason}
          onClick={() => {
            audit({ data: { action: "blocket_valuation_run", leadId } }).catch(() => {});
            onBlocketValuate!();
          }}
          ariaLabel={`Hämta Blocket-värdering${vehicle?.brand ? ` för ${vehicle.brand} ${vehicle.model ?? ""}` : ""}`} />
      )}
      <ExternalLinkLogoButton type="blocket" href={blocketUrl}
        label={apiMode ? "Blocket.se" : undefined}
        tone="external"
        disabledReason={blocketDisabledReason}
        onClick={() => { audit({ data: { action: "blocket_opened", leadId } }).catch(() => {}); }}
        ariaLabel={`Öppna Blocket-sökning${vehicle?.brand ? ` för ${vehicle.brand} ${vehicle.model ?? ""}` : ""}`} />
    </div>
  );
}
