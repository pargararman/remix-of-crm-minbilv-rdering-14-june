import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchBiluppgifterByRegnr } from "@/lib/biluppgifter.server";
import { sendSms } from "@/lib/sms/send.server";
import { valuateWithBlocket } from "@/lib/valuation/blocket-provider";
import { blocketMissingFieldsText, isVehicleCompleteForBlocket } from "@/lib/valuation/vehicle-validation";
import type { BlocketComp, ValuationResult, ValuationVehicle } from "@/lib/valuation/types";

const MANUAL_REVIEW_TAG = "manual_review";
const DEFAULT_MARGIN = 40_000;

type AutoValuationStatus =
  | "auto_priced"
  | "manual_review"
  | "skipped"
  | "error";

export interface AutoValuationResult {
  status: AutoValuationStatus;
  leadId: string;
  note: string;
  valuation?: ValuationResult;
  smsSent?: boolean;
}

function isPlaceholder(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "number") return !Number.isFinite(value) || value <= 0;
  if (typeof value !== "string") return false;
  const v = value.trim().toLowerCase();
  return !v || v === "-" || v === "—" || v === "okant" || v === "okänd" || v === "okänt" || v === "unknown";
}

function mergeMissingFields(current: Record<string, unknown> | null, incoming: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined || value === null) continue;
    if (!current || isPlaceholder(current[key])) patch[key] = value;
  }
  return patch;
}

function compactVehicle(vehicle: Record<string, unknown> | null): ValuationVehicle {
  const v = vehicle ?? {};
  return {
    brand: v.brand as string | null | undefined,
    model: v.model as string | null | undefined,
    version: v.version as string | null | undefined,
    year: v.year as number | null | undefined,
    mileage_mil: v.mileage_mil as number | null | undefined,
    fuel: v.fuel as string | null | undefined,
    gearbox: v.gearbox as string | null | undefined,
    drive_type: v.drive_type as string | null | undefined,
    body_type: v.body_type as string | null | undefined,
    horsepower: v.horsepower as number | null | undefined,
  };
}

function listingAudit(c: BlocketComp, index: number) {
  return {
    rank: index + 1,
    id: c.id ?? null,
    title: c.title ?? null,
    price: c.price,
    year: c.year ?? null,
    mileage_mil: c.mileage_mil ?? null,
    fuel: c.fuel ?? null,
    gearbox: c.gearbox ?? null,
    sellerType: c.sellerType ?? null,
    isDealer: c.isDealer ?? null,
    url: c.url ?? null,
  };
}

async function flagManualReview(leadId: string, reason: string, metadata: Record<string, unknown> = {}) {
  await Promise.allSettled([
    supabaseAdmin.from("lead_tags").upsert({ lead_id: leadId, tag: MANUAL_REVIEW_TAG } as never, {
      onConflict: "lead_id,tag",
    }),
    supabaseAdmin.from("activity_timeline").insert({
      lead_id: leadId,
      type: "manual_review_required",
      description: reason,
      actor_type: "system",
      metadata: metadata as never,
    }),
  ]);
}

async function getValuationMargin(): Promise<number> {
  const { data } = await supabaseAdmin
    .from("company_settings")
    .select("valuation_margin_amount")
    .limit(1)
    .maybeSingle();
  const margin = (data as any)?.valuation_margin_amount;
  return typeof margin === "number" && Number.isFinite(margin) && margin >= 0 ? margin : DEFAULT_MARGIN;
}

async function offerSmsAlreadySent(leadId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("messages")
    .select("id")
    .eq("lead_id", leadId)
    .eq("direction", "outbound")
    .eq("template_code", "offer_range")
    .neq("delivery_status", "failed")
    .limit(1)
    .maybeSingle();
  return !!data;
}

async function saveAutomaticPricing(leadId: string, result: ValuationResult) {
  const offer = result.customerOffer;
  if (!offer) throw new Error("Blocket-resultat saknar kundpris");

  const pricingPatch = {
    lead_id: leadId,
    valuation_from: offer.customerLow,
    valuation_to: offer.customerHigh,
    in_price_from: offer.customerLow,
    in_price_to: offer.customerHigh,
    in_price: offer.customerLow,
    out_price_from: offer.referencePrice,
    out_price_to: offer.referencePrice,
    out_price: offer.referencePrice,
    pricing_notes: offer.explanationText,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin
    .from("pricing")
    .upsert(pricingPatch as never, { onConflict: "lead_id" });
  if (error) throw error;

  await supabaseAdmin.from("activity_timeline").insert({
    lead_id: leadId,
    type: "auto_valuation_priced",
    description:
      `Automatisk värdering: Utpris ${offer.referencePrice.toLocaleString("sv-SE")} kr, ` +
      `kundintervall ${offer.customerLow.toLocaleString("sv-SE")}–${offer.customerHigh.toLocaleString("sv-SE")} kr.`,
    actor_type: "system",
    metadata: {
      pricing: pricingPatch,
      blocket: {
        note: result.note,
        query: result.query,
        confidence: result.confidence,
        sampleSize: result.sampleSize,
        sellerTypeAvailable: result.sellerTypeAvailable,
        dealerCount: result.dealerCount,
        privateCount: result.privateCount,
        referenceListing: offer.referenceListing,
        listings: result.comps.map(listingAudit),
        diagnostics: result.diagnostics,
      },
    } as never,
  });

  await supabaseAdmin.from("leads").update({ last_activity_at: new Date().toISOString() }).eq("id", leadId);
}

export async function runAutomaticLeadValuation(leadId: string): Promise<AutoValuationResult> {
  const { data: lead, error: leadError } = await supabaseAdmin
    .from("leads")
    .select("id, registration_number")
    .eq("id", leadId)
    .maybeSingle();
  if (leadError) throw leadError;
  if (!lead?.registration_number) {
    return { status: "skipped", leadId, note: "Lead saknar registreringsnummer." };
  }

  const { data: currentVehicle } = await supabaseAdmin
    .from("vehicles")
    .select("*")
    .eq("lead_id", leadId)
    .maybeSingle();

  const biluppgifter = await fetchBiluppgifterByRegnr(lead.registration_number);
  let mergedVehicle = (currentVehicle as Record<string, unknown> | null) ?? null;

  if (biluppgifter.ok) {
    const vehiclePatch = mergeMissingFields(mergedVehicle, biluppgifter.patch as Record<string, unknown>);
    if (Object.keys(vehiclePatch).length > 0) {
      const { data: saved, error } = await supabaseAdmin
        .from("vehicles")
        .upsert({ lead_id: leadId, ...vehiclePatch } as never, { onConflict: "lead_id" })
        .select("*")
        .single();
      if (error) throw error;
      mergedVehicle = saved as Record<string, unknown>;
      await supabaseAdmin.from("activity_timeline").insert({
        lead_id: leadId,
        type: "biluppgifter_lookup",
        description: `Biluppgifter hämtade och fyllde: ${Object.keys(vehiclePatch).join(", ")}`,
        actor_type: "system",
        metadata: {
          sourceUrl: biluppgifter.sourceUrl,
          warnings: biluppgifter.warnings,
          fields: Object.keys(vehiclePatch),
          rawVehicle: biluppgifter.rawVehicle,
        } as never,
      });
    }
  } else {
    const note = `Biluppgifter kunde inte hämta bilen: ${biluppgifter.error ?? "okänt fel"}`;
    await flagManualReview(leadId, note, {
      provider: "biluppgifter",
      error: biluppgifter.error ?? null,
    });
    return { status: "manual_review", leadId, note };
  }

  const vehicleForValuation = compactVehicle(mergedVehicle);
  if (!isVehicleCompleteForBlocket(vehicleForValuation)) {
    const note = blocketMissingFieldsText(vehicleForValuation);
    await flagManualReview(leadId, note, {
      provider: "biluppgifter/blocket",
      biluppgifterWarnings: biluppgifter.warnings,
      vehicle: vehicleForValuation,
    });
    return { status: "manual_review", leadId, note };
  }

  const marginAmount = await getValuationMargin();
  const valuation = await valuateWithBlocket(vehicleForValuation, {
    marginAmount,
    allowSingleComparable: true,
    minComparable: 1,
  });

  if (!valuation.ok || !valuation.customerOffer) {
    const note = valuation.note ?? "Blocket-värderingen kunde inte beräknas.";
    await flagManualReview(leadId, note, {
      provider: "blocket",
      result: valuation,
    });
    return { status: "manual_review", leadId, note, valuation };
  }

  if (!valuation.sellerTypeAvailable) {
    const note = "Blocket-svaret kunde inte särskilja handlare från privatannonser. Automatisk värdering stoppad.";
    await flagManualReview(leadId, note, { provider: "blocket", result: valuation });
    return { status: "manual_review", leadId, note, valuation };
  }

  if (valuation.dealerCount < 1) {
    const note = "Inga jämförbara handlarannonser hittades på Blocket. Automatisk värdering stoppad.";
    await flagManualReview(leadId, note, { provider: "blocket", result: valuation });
    return { status: "manual_review", leadId, note, valuation };
  }

  await saveAutomaticPricing(leadId, valuation);

  if (valuation.sampleSize < 2 || valuation.customerOffer.referenceRank === 1) {
    await flagManualReview(leadId, "Automatisk värdering använder endast en handlarannons och behöver granskas.", {
      provider: "blocket",
      result: valuation,
    });
  }

  let smsSent = false;
  if (!(await offerSmsAlreadySent(leadId))) {
    const sms = await sendSms({ leadId, templateCode: "offer_range", isSystem: true });
    smsSent = sms.ok;
    if (!sms.ok) {
      await supabaseAdmin.from("activity_timeline").insert({
        lead_id: leadId,
        type: "sms_failed",
        description: `Automatiskt värderings-SMS kunde inte skickas: ${sms.error ?? "okänt fel"}`,
        actor_type: "system",
        metadata: { templateCode: "offer_range", error: sms.error ?? null } as never,
      });
    }
  }

  return {
    status: valuation.sampleSize < 2 ? "manual_review" : "auto_priced",
    leadId,
    note: valuation.note ?? "Automatisk värdering klar.",
    valuation,
    smsSent,
  };
}
