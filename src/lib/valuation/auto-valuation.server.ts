import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchBiluppgifterByRegnr } from "@/lib/biluppgifter.server";
import { sendSms } from "@/lib/sms/send.server";
import { sendViaTwilio } from "@/lib/sms/twilio.server";
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

function normForConflict(value: unknown): string | number | null {
  if (isPlaceholder(value)) return null;
  if (typeof value === "number") return Math.round(value);
  if (typeof value === "string") {
    return value
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/å/g, "a")
      .replace(/ä/g, "a")
      .replace(/ö/g, "o")
      .replace(/[^a-z0-9]/g, "");
  }
  return String(value);
}

function vehicleConflicts(current: Record<string, unknown> | null, incoming: Record<string, unknown>): string[] {
  if (!current) return [];
  const fields = ["brand", "model", "year", "fuel", "gearbox", "body_type", "drive_type", "horsepower"];
  const conflicts: string[] = [];
  for (const field of fields) {
    const a = normForConflict(current[field]);
    const b = normForConflict(incoming[field]);
    if (a == null || b == null) continue;
    if (field === "model" && typeof a === "string" && typeof b === "string" && (a.includes(b) || b.includes(a))) continue;
    if (
      field === "drive_type" &&
      typeof a === "string" &&
      typeof b === "string" &&
      !a.includes("fyrhjul") &&
      !b.includes("fyrhjul") &&
      (a.includes("tva") || a.includes("fram") || a.includes("bak")) &&
      (b.includes("tva") || b.includes("fram") || b.includes("bak"))
    ) {
      continue;
    }
    if (a !== b) conflicts.push(field);
  }
  return conflicts;
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

function envList(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function notifyManualValuationUsers(leadId: string, reason: string, metadata: Record<string, unknown>) {
  const { data: existing } = await supabaseAdmin
    .from("notifications")
    .select("id")
    .eq("lead_id", leadId)
    .eq("type", "manual_valuation_required")
    .limit(1)
    .maybeSingle();
  if (existing) return;

  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("id, customer_name, registration_number, owner_id")
    .eq("id", leadId)
    .maybeSingle();

  const userIds = envList("MANUAL_VALUATION_NOTIFY_USER_IDS");
  const emails = envList("MANUAL_VALUATION_NOTIFY_EMAILS").map((email) => email.toLowerCase());
  const explicitRecipients = userIds.length > 0 || emails.length > 0;

  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, email, name, role, status, notification_phone, phone")
    .eq("status", "active");

  const recipients = new Map<string, NonNullable<typeof profiles>[number]>();
  for (const p of profiles ?? []) {
    const email = (p.email ?? "").toLowerCase();
    if (explicitRecipients) {
      if (userIds.includes(p.id) || (email && emails.includes(email))) recipients.set(p.id, p);
    } else if (p.id === lead?.owner_id || p.role === "admin") {
      recipients.set(p.id, p);
    }
  }

  const title = "Lead behöver manuell värdering";
  const reg = lead?.registration_number ? ` ${lead.registration_number}` : "";
  const body = `${lead?.customer_name ?? "Lead"}${reg}: ${reason}`;
  const rows = [...recipients.values()].map((p) => ({
    user_id: p.id,
    lead_id: leadId,
    type: "manual_valuation_required",
    title,
    body,
    metadata: metadata as never,
  }));

  const smsResults: { userId: string; ok: boolean; error?: string }[] = [];
  if (rows.length > 0) {
    await supabaseAdmin.from("notifications").insert(rows as never);
  }

  const from = process.env.TWILIO_PHONE_NUMBER;
  if (from) {
    await Promise.allSettled([...recipients.values()].map(async (p) => {
      const to = p.notification_phone ?? p.phone;
      if (!to) return;
      try {
        await sendViaTwilio({
          from,
          to,
          body: `Manuell värdering behövs${reg}: ${reason}`.slice(0, 300),
        });
        smsResults.push({ userId: p.id, ok: true });
      } catch (e) {
        smsResults.push({ userId: p.id, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }));
  }

  await supabaseAdmin.from("activity_timeline").insert({
    lead_id: leadId,
    type: "manual_review_notified",
    description: `Intern notis skapad för manuell värdering (${recipients.size} mottagare).`,
    actor_type: "system",
    metadata: {
      recipientUserIds: [...recipients.keys()],
      smsResults,
      reason,
    } as never,
  });
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
  await notifyManualValuationUsers(leadId, reason, metadata).catch((e) => {
    console.error("manual valuation notification failed:", e);
  });
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

async function saveAutomaticPricing(leadId: string, result: ValuationResult, vehicle: ValuationVehicle) {
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
    pricing_notes: offer.customerSmsText,
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
      `Inpris ${offer.customerLow.toLocaleString("sv-SE")}–${offer.customerHigh.toLocaleString("sv-SE")} kr, ` +
      `${result.confidenceLevel} confidence.`,
    actor_type: "system",
    metadata: {
      vehicle,
      pricing: pricingPatch,
      valuation: {
        marketMedian: result.marketMedian,
        lowerMarketPrice: result.lowerMarketPrice,
        utpris: result.utpris,
        inprisLow: offer.customerLow,
        inprisHigh: offer.customerHigh,
        dealerMarginUsed: offer.dealerMarginTarget,
        reconditioningBuffer: offer.reconditioningBuffer,
        riskBuffer: offer.riskBuffer,
        adminTransportBuffer: offer.adminTransportBuffer,
        negotiationBuffer: offer.negotiationBuffer,
        totalDeduction: offer.totalDeduction,
        confidenceScore: result.confidence,
        confidenceLevel: result.confidenceLevel,
        dealerAttractivenessScore: result.dealerAttractivenessScore,
        fallbackStage: result.fallbackStage,
        sanityChecks: result.sanityChecks,
        smsEligible: result.smsEligible,
      },
      blocket: {
        note: result.note,
        query: result.query,
        searchAttempts: result.searchAttempts,
        confidence: result.confidence,
        confidenceLevel: result.confidenceLevel,
        sampleSize: result.sampleSize,
        sellerTypeAvailable: result.sellerTypeAvailable,
        dealerCount: result.dealerCount,
        privateCount: result.privateCount,
        comparableCount: result.comparableCount,
        removedCount: result.removedCount,
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
    const conflicts = vehicleConflicts(mergedVehicle, biluppgifter.patch as Record<string, unknown>);
    if (conflicts.length > 0) {
      const note = `Biluppgifter matchar inte befintliga bilfält: ${conflicts.join(", ")}. Manuell värdering krävs.`;
      await flagManualReview(leadId, note, {
        provider: "biluppgifter",
        conflicts,
        currentVehicle: mergedVehicle,
        biluppgifterPatch: biluppgifter.patch,
        rawVehicle: biluppgifter.rawVehicle,
      });
      return { status: "manual_review", leadId, note };
    }

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
    minComparable: 3,
  });

  if (!valuation.ok || !valuation.customerOffer) {
    const note = valuation.note ?? "Blocket-värderingen kunde inte beräknas.";
    await flagManualReview(leadId, note, {
      provider: "blocket",
      result: valuation,
    });
    return { status: "manual_review", leadId, note, valuation };
  }

  if (!valuation.smsEligible) {
    const note =
      valuation.sanityChecks.blockers.length > 0
        ? `Automatisk SMS-värdering stoppad: ${valuation.sanityChecks.blockers.join(" ")}`
        : "Automatisk SMS-värdering stoppad av confidence/sanity checks.";
    await flagManualReview(leadId, note, { provider: "blocket", result: valuation });
    return { status: "manual_review", leadId, note, valuation };
  }

  await saveAutomaticPricing(leadId, valuation, vehicleForValuation);

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
    status: "auto_priced",
    leadId,
    note: valuation.note ?? "Automatisk värdering klar.",
    valuation,
    smsSent,
  };
}
