// Live valuation verification runner for the dealer-safe pricing flow.
//
// Default behavior:
//   - fetches Biluppgifter vehicle data for the configured plates
//   - overrides mileage with the provided test mileage
//   - runs the production Blocket valuation provider
//   - saves vehicle/pricing rows only when SUPABASE_SERVICE_ROLE_KEY is present
//   - never sends Twilio/SMS
//
// Run:
//   esbuild test/valuation-test-cars.ts --bundle --platform=node --format=esm --outfile=/tmp/valuation-test-cars.mjs
//   node /tmp/valuation-test-cars.mjs
//
// Useful flags:
//   --no-save    Run API valuation only, do not write CRM rows.
//   --json       Print JSON instead of a Markdown table.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fetchBiluppgifterByRegnr } from "../src/lib/biluppgifter.server";
import { valuateWithBlocket } from "../src/lib/valuation/blocket-provider";
import type { BiluppgifterLookupResult } from "../src/lib/biluppgifter.server";
import type { CustomerOfferResult, ValuationResult, ValuationVehicle } from "../src/lib/valuation/types";

type TestCar = {
  regnr: string;
  mileageMil: number;
};

type SaveVerification = {
  requested: boolean;
  saved: boolean;
  leadId: string | null;
  createdLead: boolean;
  vehiclePersisted: boolean;
  pricingPersisted: boolean;
  smsWouldUseSavedInpris: boolean;
  error: string | null;
};

type TestRow = {
  regnr: string;
  apiMileageMil: number | null;
  mileageUsed: number;
  make: string | null;
  model: string | null;
  year: number | null;
  utpris: number | null;
  inprisLow: number | null;
  inprisHigh: number | null;
  validComparables: number;
  fallbackStage: number | null;
  dealerAttractivenessScore: number;
  confidenceScore: number;
  confidenceLevel: string;
  valuationStatus: string;
  smsDecision: "would_send" | "blocked";
  smsBlockedReason: string;
  valuationOk: boolean;
  valuationNote: string | null;
  save: SaveVerification;
};

const TEST_CARS: TestCar[] = [
  { regnr: "RCZ85W", mileageMil: 13_000 },
  { regnr: "NJJ13F", mileageMil: 3_100 },
  { regnr: "PLN459", mileageMil: 14_400 },
  { regnr: "SWN26Y", mileageMil: 8_200 },
  { regnr: "HJM28L", mileageMil: 7_456 },
  { regnr: "SKG686", mileageMil: 8_500 },
  { regnr: "BSY11R", mileageMil: 8_000 },
  { regnr: "BEJ73U", mileageMil: 7_115 },
];

const DEFAULT_MARGIN = 40_000;
const args = new Set(process.argv.slice(2));
const saveRequested = !args.has("--no-save");
const jsonOutput = args.has("--json");

function loadEnvFile(path = ".env") {
  const fullPath = resolve(process.cwd(), path);
  if (!existsSync(fullPath)) return;
  const raw = readFileSync(fullPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, valueRaw] = match;
    if (process.env[key] != null) continue;
    let value = valueRaw.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function normalizeRegnr(regnr: string): string {
  return regnr.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function sek(value: number | null): string {
  return value == null ? "-" : value.toLocaleString("sv-SE", { maximumFractionDigits: 0 }).replace(/\s/g, " ");
}

function asInt(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

function compactVehicle(patch: BiluppgifterLookupResult["patch"], mileageMil: number): ValuationVehicle {
  return {
    brand: patch.brand ?? null,
    model: patch.model ?? null,
    version: patch.version ?? null,
    year: patch.year ?? null,
    mileage_mil: mileageMil,
    fuel: patch.fuel ?? null,
    gearbox: patch.gearbox ?? null,
    drive_type: patch.drive_type ?? null,
    body_type: patch.body_type ?? null,
    horsepower: patch.horsepower ?? null,
  };
}

function pricingPatchFromOffer(offer: CustomerOfferResult) {
  return {
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
}

function smsBlockedReason(result: ValuationResult | null, biluppgifter: BiluppgifterLookupResult): string {
  if (!biluppgifter.ok) return biluppgifter.error ?? "Biluppgifter lookup failed";
  if (!result) return "Blocket valuation was not run";
  const blockers = result.sanityChecks?.blockers ?? [];
  if (blockers.length > 0) return blockers.join(" ");
  if (!result.ok) return result.note ?? "Valuation failed";
  if (!result.smsEligible) return result.note ?? "SMS blocked by confidence/sanity checks";
  return "";
}

function emptySaveVerification(requested: boolean): SaveVerification {
  return {
    requested,
    saved: false,
    leadId: null,
    createdLead: false,
    vehiclePersisted: false,
    pricingPersisted: false,
    smsWouldUseSavedInpris: false,
    error: null,
  };
}

function supabaseFromEnv(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function getMargin(client: SupabaseClient | null): Promise<number> {
  const envMargin = Number(process.env.VALUATION_MARGIN_AMOUNT);
  if (Number.isFinite(envMargin) && envMargin >= 0) return Math.round(envMargin);
  if (!client) return DEFAULT_MARGIN;
  const { data, error } = await client
    .from("company_settings")
    .select("valuation_margin_amount")
    .limit(1)
    .maybeSingle();
  if (error) return DEFAULT_MARGIN;
  const margin = (data as { valuation_margin_amount?: unknown } | null)?.valuation_margin_amount;
  return typeof margin === "number" && Number.isFinite(margin) && margin >= 0
    ? Math.round(margin)
    : DEFAULT_MARGIN;
}

async function findOrCreateTestLead(client: SupabaseClient, regnr: string): Promise<{ leadId: string; created: boolean }> {
  const { data: existing, error: existingError } = await client
    .from("leads")
    .select("id")
    .eq("registration_number", regnr)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;
  if ((existing as { id?: string } | null)?.id) return { leadId: (existing as { id: string }).id, created: false };

  const { data: inserted, error: insertError } = await client
    .from("leads")
    .insert({
      customer_name: `Valuation Test ${regnr}`,
      phone: "+46000000000",
      email: `valuation-test+${regnr.toLowerCase()}@example.com`,
      registration_number: regnr,
      city: "Test",
      source: "manual",
      stage: "ny_lead",
      gdpr_consent: false,
      free_text: "Created by valuation-test-cars runner. Do not send real customer SMS.",
    })
    .select("id")
    .single();
  if (insertError) throw insertError;
  return { leadId: (inserted as { id: string }).id, created: true };
}

async function saveToCrm(args: {
  client: SupabaseClient | null;
  requested: boolean;
  regnr: string;
  vehicle: ValuationVehicle;
  biluppgifter: BiluppgifterLookupResult;
  valuation: ValuationResult | null;
}): Promise<SaveVerification> {
  const verification = emptySaveVerification(args.requested);
  if (!args.requested) return verification;
  if (!args.client) {
    verification.error = "SUPABASE_SERVICE_ROLE_KEY missing; CRM rows were not saved.";
    return verification;
  }

  try {
    const { leadId, created } = await findOrCreateTestLead(args.client, args.regnr);
    verification.leadId = leadId;
    verification.createdLead = created;

    if (args.biluppgifter.ok) {
      const vehiclePatch = {
        lead_id: leadId,
        brand: args.vehicle.brand ?? null,
        model: args.vehicle.model ?? null,
        version: args.vehicle.version ?? null,
        year: args.vehicle.year ?? null,
        mileage_mil: args.vehicle.mileage_mil ?? null,
        fuel: args.vehicle.fuel ?? null,
        gearbox: args.vehicle.gearbox ?? null,
        drive_type: args.vehicle.drive_type ?? null,
        body_type: args.vehicle.body_type ?? null,
        horsepower: args.vehicle.horsepower ?? null,
        inspection_until: args.biluppgifter.patch.inspection_until ?? null,
        equipment_notes: args.biluppgifter.patch.equipment_notes ?? null,
        fuel_needs_review: args.biluppgifter.patch.fuel_needs_review ?? false,
        body_type_needs_review: args.biluppgifter.patch.body_type_needs_review ?? false,
        updated_at: new Date().toISOString(),
      };
      const { error } = await args.client
        .from("vehicles")
        .upsert(vehiclePatch, { onConflict: "lead_id" });
      if (error) throw error;
      verification.vehiclePersisted = true;
    }

    const offer = args.valuation?.customerOffer;
    if (offer) {
      const pricingPatch = pricingPatchFromOffer(offer);
      const { error } = await args.client
        .from("pricing")
        .upsert({ lead_id: leadId, ...pricingPatch }, { onConflict: "lead_id" });
      if (error) throw error;
      verification.pricingPersisted = true;

      const { data: savedPricing, error: verifyPricingError } = await args.client
        .from("pricing")
        .select("valuation_from, valuation_to, in_price_from, in_price_to, out_price, out_price_from, out_price_to, pricing_notes")
        .eq("lead_id", leadId)
        .maybeSingle();
      if (verifyPricingError) throw verifyPricingError;
      const p = savedPricing as Record<string, unknown> | null;
      verification.smsWouldUseSavedInpris =
        asInt(p?.valuation_from) === offer.customerLow &&
        asInt(p?.valuation_to) === offer.customerHigh &&
        asInt(p?.in_price_from) === offer.customerLow &&
        asInt(p?.in_price_to) === offer.customerHigh &&
        asInt(p?.out_price) === offer.referencePrice &&
        asInt(p?.out_price_from) === offer.referencePrice &&
        asInt(p?.out_price_to) === offer.referencePrice &&
        typeof p?.pricing_notes === "string" &&
        p.pricing_notes.includes(sek(offer.customerLow)) &&
        p.pricing_notes.includes(sek(offer.customerHigh));
    }

    await args.client.from("activity_timeline").insert({
      lead_id: leadId,
      type: "valuation_test_result",
      description: args.valuation?.customerOffer
        ? `Testvärdering: Utpris ${sek(args.valuation.customerOffer.referencePrice)} kr, Inpris ${sek(args.valuation.customerOffer.customerLow)}-${sek(args.valuation.customerOffer.customerHigh)} kr. SMS skickades inte.`
        : `Testvärdering kunde inte prissätta bilen. SMS skickades inte.`,
      actor_type: "system",
      metadata: {
        testMode: true,
        smsSent: false,
        registrationNumber: args.regnr,
        vehicle: args.vehicle,
        biluppgifterWarnings: args.biluppgifter.warnings,
        valuation: args.valuation,
      },
    });

    await args.client
      .from("leads")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", leadId);

    verification.saved = verification.vehiclePersisted || verification.pricingPersisted;
    return verification;
  } catch (error) {
    verification.error = error instanceof Error ? error.message : String(error);
    return verification;
  }
}

async function runOne(car: TestCar, client: SupabaseClient | null, marginAmount: number): Promise<TestRow> {
  const regnr = normalizeRegnr(car.regnr);
  const biluppgifter = await fetchBiluppgifterByRegnr(regnr);
  const vehicle = compactVehicle(biluppgifter.patch, car.mileageMil);
  const apiMileageMil = biluppgifter.ok ? biluppgifter.patch.mileage_mil ?? null : null;

  let valuation: ValuationResult | null = null;
  if (biluppgifter.ok) {
    valuation = await valuateWithBlocket(vehicle, {
      marginAmount,
      minComparable: 3,
    });
  }

  const offer = valuation?.customerOffer ?? null;
  const smsDecision = valuation?.smsEligible ? "would_send" : "blocked";
  const save = await saveToCrm({
    client,
    requested: saveRequested,
    regnr,
    vehicle,
    biluppgifter,
    valuation,
  });

  return {
    regnr,
    apiMileageMil,
    mileageUsed: car.mileageMil,
    make: vehicle.brand ?? null,
    model: vehicle.model ?? null,
    year: typeof vehicle.year === "number" ? vehicle.year : null,
    utpris: offer?.referencePrice ?? valuation?.utpris ?? null,
    inprisLow: offer?.customerLow ?? null,
    inprisHigh: offer?.customerHigh ?? null,
    validComparables: valuation?.sampleSize ?? 0,
    fallbackStage: valuation?.fallbackStage ?? null,
    dealerAttractivenessScore: valuation?.dealerAttractivenessScore ?? 0,
    confidenceScore: valuation?.confidence ?? 0,
    confidenceLevel: valuation?.confidenceLevel ?? "low",
    valuationStatus: valuation?.valuationStatus ?? "needs_review_no_price",
    smsDecision,
    smsBlockedReason: smsDecision === "blocked" ? smsBlockedReason(valuation, biluppgifter) : "",
    valuationOk: valuation?.ok ?? false,
    valuationNote: valuation?.note ?? biluppgifter.error ?? null,
    save,
  };
}

function mdCell(value: unknown): string {
  const s = String(value ?? "-");
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function markdownTable(rows: TestRow[]): string {
  const headers = [
    "Registration",
    "Make",
    "Model",
    "Year",
    "Mileage used",
    "Utpris",
    "Inpris low",
    "Inpris high",
    "Valid comps",
    "Fallback",
    "Dealer score",
    "Confidence",
    "Status",
    "SMS",
    "Blocked reason",
    "CRM saved",
  ];
  const body = rows.map((r) => [
    r.regnr,
    r.make ?? "-",
    r.model ?? "-",
    r.year ?? "-",
    sek(r.mileageUsed),
    sek(r.utpris),
    sek(r.inprisLow),
    sek(r.inprisHigh),
    r.validComparables,
    r.fallbackStage ?? "-",
    r.dealerAttractivenessScore,
    `${r.confidenceLevel} (${Math.round(r.confidenceScore * 100)}%)`,
    r.valuationStatus,
    r.smsDecision === "would_send" ? "Would send" : "Blocked",
    r.smsBlockedReason || "-",
    r.save.saved
      ? `yes (${r.save.leadId}${r.save.createdLead ? ", created" : ""})`
      : `no${r.save.error ? `: ${r.save.error}` : ""}`,
  ]);
  return [
    `| ${headers.map(mdCell).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...body.map((cells) => `| ${cells.map(mdCell).join(" | ")} |`),
  ].join("\n");
}

async function main() {
  loadEnvFile();
  process.env.SMS_TEST_MODE = "true";

  const client = saveRequested ? supabaseFromEnv() : null;
  const marginAmount = await getMargin(client);
  const rows: TestRow[] = [];

  for (const car of TEST_CARS) {
    rows.push(await runOne(car, client, marginAmount));
  }

  if (jsonOutput) {
    console.log(JSON.stringify({ marginAmount, saveRequested, rows }, null, 2));
  } else {
    console.log(`Valuation test cars (${new Date().toISOString()})`);
    console.log(`Margin amount used: ${sek(marginAmount)} kr`);
    console.log(`CRM save requested: ${saveRequested ? "yes" : "no"}`);
    console.log(`CRM save available: ${client ? "yes" : "no - missing SUPABASE_SERVICE_ROLE_KEY"}`);
    console.log("SMS sent: no (test mode; this runner never calls Twilio)");
    console.log();
    console.log(markdownTable(rows));
  }

  if (saveRequested && !client) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
