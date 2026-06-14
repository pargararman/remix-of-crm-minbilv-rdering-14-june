// Server function for the Blocket-API valuation.
//
// Runs entirely server-side (Cloudflare/TanStack) so the unofficial Blocket
// endpoint is never called from the browser (CORS + keeps the UA server-side).
// Reads the lead's vehicle, asks the provider for a comparable-listings range,
// writes a best-effort timeline row, and returns the result to the client.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { valuateWithBlocket } from "@/lib/valuation/blocket-provider";
import type { ValuationResult, ValuationVehicle } from "@/lib/valuation/types";

export const valuateBlocket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ leadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<ValuationResult> => {
    const { data: vehicle } = await context.supabase
      .from("vehicles")
      .select("brand, model, version, year, mileage_mil, fuel, gearbox, drive_type, body_type")
      .eq("lead_id", data.leadId)
      .maybeSingle();

    if (!vehicle) {
      return {
        ok: false,
        sampleSize: 0,
        marketLow: null,
        marketHigh: null,
        marketMedian: null,
        soldLow: null,
        soldHigh: null,
        confidence: 0,
        query: { q: "", page: 1, sort: "price" },
        note: "Inget fordon registrerat på leadet.",
        comps: [],
      };
    }

    const result = await valuateWithBlocket(vehicle as ValuationVehicle);

    // Best-effort timeline row — never block/throw on the audit write.
    queueMicrotask(() => {
      const desc = result.ok
        ? `Blocket-värdering: ${result.offerMedian?.toLocaleString("sv-SE")} kr (median av ${result.sampleSize} billigaste av ${result.dealerCount} handlarannonser)`
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
            dealerCount: result.dealerCount,
            sampleSize: result.sampleSize,
            offerMedian: result.offerMedian,
            marketMedian: result.marketMedian,
            marketLow: result.marketLow,
            marketHigh: result.marketHigh,
            confidence: result.confidence,
            query: result.query,
          } as never,
        })
        .then(({ error }) => {
          if (error) console.error("blocket_valuation timeline insert failed", error);
        });
    });

    return result;
  });
