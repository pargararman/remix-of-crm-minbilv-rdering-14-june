// Server function for production Blocket valuation.
// Runs server-side only. Returns market context + customer offer calculated from:
// second-cheapest comparable listing minus agreed deduction.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { valuateWithBlocket } from "@/lib/valuation/blocket-provider";
import { blocketMissingFieldsText, isVehicleCompleteForBlocket } from "@/lib/valuation/vehicle-validation";
import type { ValuationResult, ValuationVehicle } from "@/lib/valuation/types";

function emptyResult(note: string): ValuationResult {
  return {
    ok: false,
    totalCount: 0,
    comparableCount: 0,
    dealerCount: 0,
    privateCount: 0,
    sellerTypeAvailable: false,
    sampleSize: 0,
    offerMedian: null,
    marketMedian: null,
    marketLow: null,
    marketHigh: null,
    cheapest: null,
    mostExpensive: null,
    customerOffer: null,
    confidence: 0,
    query: { q: "", page: 1, sort: "price" },
    note,
    comps: [],
  };
}

export const valuateBlocket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ leadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<ValuationResult> => {
    const { data: vehicle } = await context.supabase
      .from("vehicles")
      .select("brand, model, version, year, mileage_mil, fuel, gearbox, drive_type, body_type, horsepower")
      .eq("lead_id", data.leadId)
      .maybeSingle();

    if (!vehicle) return emptyResult("Inget fordon registrerat på leadet.");

    if (!isVehicleCompleteForBlocket(vehicle as ValuationVehicle)) {
      return emptyResult(blocketMissingFieldsText(vehicle as ValuationVehicle));
    }

    const { data: settings } = await context.supabase
      .from("company_settings")
      .select("valuation_margin_amount")
      .limit(1)
      .maybeSingle();

    const marginAmount =
      typeof (settings as any)?.valuation_margin_amount === "number"
        ? (settings as any).valuation_margin_amount
        : null;

    const result = await valuateWithBlocket(vehicle as ValuationVehicle, { marginAmount });

    // Best-effort timeline row — never block/throw on the audit write.
    queueMicrotask(() => {
      const offer = result.customerOffer;
      const desc = result.ok && offer
        ? `Blocket-värdering: kundvärdering ${offer.customerOffer.toLocaleString("sv-SE")} kr ` +
          `(referens: näst lägsta jämförbara ${offer.referencePrice.toLocaleString("sv-SE")} kr, ` +
          `avdrag ${offer.deduction.toLocaleString("sv-SE")} kr, ${result.sampleSize} annonser använda)`
        : `Blocket-värdering misslyckades: ${result.note ?? "okänt fel"}`;

      void context.supabase
        .from("activity_timeline")
        .insert({
          lead_id: data.leadId,
          type: "blocket_valuation",
          description: desc,
          actor_id: context.userId,
          actor_type: "seller",
          metadata: {
            ok: result.ok,
            totalCount: result.totalCount,
            comparableCount: result.comparableCount,
            dealerCount: result.dealerCount,
            privateCount: result.privateCount,
            sellerTypeAvailable: result.sellerTypeAvailable,
            sampleSize: result.sampleSize,
            marketMedian: result.marketMedian,
            marketLow: result.marketLow,
            marketHigh: result.marketHigh,
            customerOffer: result.customerOffer,
            confidence: result.confidence,
            query: result.query,
            diagnostics: result.diagnostics,
          } as never,
        })
        .then(({ error }) => {
          if (error) console.error("blocket_valuation timeline insert failed", error);
        });
    });

    return result;
  });
