// Vehicle assessment server functions.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchBiluppgifterByRegnr } from "@/lib/biluppgifter.server";

import { FUEL_VALUES, BODY_TYPE_VALUES, GEARBOX_VALUES, DRIVE_VALUES } from "@/lib/vehicle-enums";

const FuelEnum = z.enum(FUEL_VALUES as [string, ...string[]]);
const BodyEnum = z.enum(BODY_TYPE_VALUES as [string, ...string[]]);
const GearboxEnum = z.enum(GEARBOX_VALUES as [string, ...string[]]);
const DriveEnum = z.enum(DRIVE_VALUES as [string, ...string[]]);

const VehicleSchema = z.object({
  leadId: z.string().uuid(),
  patch: z.object({
    brand: z.string().max(100).nullable().optional(),
    model: z.string().max(100).nullable().optional(),
    version: z.string().max(200).nullable().optional(),
    year: z.number().int().min(1900).max(2100).nullable().optional(),
    mileage_mil: z.number().int().min(0).max(1000000).nullable().optional(),
    fuel: FuelEnum.nullable().optional(),
    gearbox: GearboxEnum.nullable().optional(),
    drive_type: DriveEnum.nullable().optional(),
    body_type: BodyEnum.nullable().optional(),
    horsepower: z.number().int().min(0).max(5000).nullable().optional(),
    equipment: z.string().max(4000).nullable().optional(),
    service_book: z.string().max(50).nullable().optional(),
    keys_count: z.string().max(20).nullable().optional(),
    tires: z.string().max(50).nullable().optional(),
    condition: z.string().max(50).nullable().optional(),
    damage_notes: z.string().max(4000).nullable().optional(),
    paint_condition: z.string().max(500).nullable().optional(),
    interior_condition: z.string().max(500).nullable().optional(),
    smoke_free: z.boolean().nullable().optional(),
    warning_lights: z.boolean().nullable().optional(),
    inspection_until: z.string().nullable().optional(),
    engine_gearbox_notes: z.string().max(4000).nullable().optional(),
    timing_belt_notes: z.string().max(2000).nullable().optional(),
    extra_equipment: z.string().max(4000).nullable().optional(),
    urgency: z.string().max(50).nullable().optional(),
    dealer_feedback: z.string().max(4000).nullable().optional(),
    summer_tires_notes: z.string().max(1000).nullable().optional(),
    winter_tires_notes: z.string().max(1000).nullable().optional(),
    last_service_date: z.string().nullable().optional(),
    last_service_notes: z.string().max(2000).nullable().optional(),
  }),
});

export const getVehicle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ leadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: vehicle } = await context.supabase
      .from("vehicles")
      .select("*")
      .eq("lead_id", data.leadId)
      .maybeSingle();
    return { vehicle };
  });

function isPlaceholder(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "number") return !Number.isFinite(value) || value <= 0;
  if (typeof value === "boolean") return false;
  if (typeof value !== "string") return false;
  const v = value.trim().toLowerCase();
  return !v || v === "-" || v === "—" || v === "okant" || v === "okänd" || v === "okänt" || v === "unknown";
}

function mergeBiluppgifterPatch(
  current: Record<string, unknown> | null,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "boolean") {
      if (value === true && current?.[key] !== true) patch[key] = true;
      continue;
    }
    if (!current || isPlaceholder(current[key])) patch[key] = value;
  }
  return patch;
}

export const syncVehicleFromBiluppgifter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ leadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [{ data: lead, error: leadError }, { data: currentVehicle }] = await Promise.all([
      supabase
        .from("leads")
        .select("id, registration_number")
        .eq("id", data.leadId)
        .maybeSingle(),
      supabase
        .from("vehicles")
        .select("*")
        .eq("lead_id", data.leadId)
        .maybeSingle(),
    ]);
    if (leadError) throw new Error(leadError.message);
    const regnr = (lead as any)?.registration_number;
    if (!regnr) throw new Error("Lead saknar registreringsnummer.");

    const lookup = await fetchBiluppgifterByRegnr(regnr);
    if (!lookup.ok) {
      await supabase.from("activity_timeline").insert({
        lead_id: data.leadId,
        type: "biluppgifter_lookup_failed",
        description: `Biluppgifter kunde inte hämta bilen: ${lookup.error ?? "okänt fel"}`,
        actor_id: userId,
        actor_type: "seller",
        metadata: { error: lookup.error ?? null, warnings: lookup.warnings } as never,
      } as never);
      throw new Error(lookup.error ?? "Biluppgifter kunde inte hämta bilen.");
    }

    const patch = mergeBiluppgifterPatch(
      (currentVehicle as Record<string, unknown> | null) ?? null,
      lookup.patch as Record<string, unknown>,
    );
    if (Object.keys(patch).length === 0) {
      return { ok: true, changed: 0, vehicle: currentVehicle, warnings: lookup.warnings };
    }

    const { data: vehicle, error } = await supabase
      .from("vehicles")
      .upsert({ lead_id: data.leadId, ...patch, updated_at: new Date().toISOString() } as never, {
        onConflict: "lead_id",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("activity_timeline").insert({
      lead_id: data.leadId,
      type: "biluppgifter_lookup",
      description: `Biluppgifter hämtade och fyllde: ${Object.keys(patch).join(", ")}`,
      actor_id: userId,
      actor_type: "seller",
      metadata: {
        sourceUrl: lookup.sourceUrl,
        warnings: lookup.warnings,
        fields: Object.keys(patch),
        rawVehicle: lookup.rawVehicle,
      } as never,
    } as never);

    return { ok: true, changed: Object.keys(patch).length, vehicle, warnings: lookup.warnings };
  });

export const updateVehicle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => VehicleSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data.patch)) {
      patch[k] = v ?? null;
    }
    if (Object.keys(patch).length === 0) return { ok: true, changed: 0, vehicle: null };

    // EN upsert. Returnera färska raden direkt så klienten kan skriva in den i cachen utan refetch.
    const { data: vehicle, error } = await supabase
      .from("vehicles")
      .upsert({ lead_id: data.leadId, ...patch } as never, { onConflict: "lead_id" })
      .select("*")
      .single();
    if (error) throw error;

    // Bakgrund: timeline-rad.
    queueMicrotask(() => {
      void supabase
        .from("activity_timeline")
        .insert({
          lead_id: data.leadId,
          type: "vehicle_assessment_updated",
          description: `Bedömning uppdaterad: ${Object.keys(patch).join(", ")}`,
          actor_id: userId,
          actor_type: "seller",
          metadata: { fields: Object.keys(patch) } as never,
        })
        .then(({ error: tlErr }) => {
          if (tlErr) console.error("activity_timeline insert failed", tlErr);
        });
    });

    return { ok: true, changed: Object.keys(patch).length, vehicle };
  });
