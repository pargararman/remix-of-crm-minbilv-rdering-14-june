// Server-funktioner för leads (listning för dashboard).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { STAGE_GROUP_TO_DB, type StageGroup } from "@/lib/stage-groups";
import { FUEL_VALUES, GEARBOX_VALUES } from "@/lib/vehicle-enums";


export type LeadStage =
  | "ny_lead"
  | "snabb_vardering"
  | "kontaktad"
  | "uppfoljning_1"
  | "uppfoljning_2"
  | "uppfoljning_3"
  | "inget_svar"
  | "matchad"
  | "bud_mottaget"
  | "kund_accepterat"
  | "kontrakt_pagar_avtal"
  | "hamtning"
  | "vunnen"
  | "forlorad"
  | "arkiverad";

export type LeadStageView = LeadStage;

const REAL_STAGES: LeadStage[] = [
  "ny_lead",
  "snabb_vardering",
  "kontaktad",
  "uppfoljning_1",
  "uppfoljning_2",
  "uppfoljning_3",
  "inget_svar",
  "matchad",
  "bud_mottaget",
  "kund_accepterat",
  "kontrakt_pagar_avtal",
  "hamtning",
  "vunnen",
  "forlorad",
  "arkiverad",
];

export interface LeadRow {
  id: string;
  customer_name: string | null;
  phone: string;
  email: string | null;
  registration_number: string;
  stage: LeadStage;
  owner_id: string | null;
  lead_score: number;
  source: string;
  created_at: string;
  last_activity_at: string;
  city: string | null;
  archived_at: string | null;
  vehicle?: {
    brand: string | null;
    model: string | null;
    version: string | null;
    year: number | null;
    mileage_mil: number | null;
    fuel: string | null;
    gearbox: string | null;
    service_book: string | null;
    tires: string | null;
    keys_count: string | null;
    condition: string | null;
    damage_notes: string | null;
    inspection_until: string | null;
  } | null;
  pricing?: {
    customer_expectation: number | null;
    valuation_from: number | null;
    valuation_to: number | null;
    in_price: number | null;
    out_price: number | null;
    in_price_from: number | null;
    in_price_to: number | null;
    out_price_from: number | null;
    out_price_to: number | null;
  } | null;
}

const listLeadsSchema = z
  .object({
    stage: z.string().optional(),
    stageGroup: z.string().optional(),
    limit: z.number().int().min(1).max(500).optional(),
    bodyTypes: z.array(z.string()).max(20).optional(),
    q: z.string().trim().max(100).optional(),
  })
  .optional();



export const listLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => listLeadsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const stage = data?.stage;
    const stageGroup = data?.stageGroup as StageGroup | undefined;
    const limit = data?.limit ?? 200;
    const bodyTypes = data?.bodyTypes ?? [];
    const qStr = data?.q?.trim() ?? "";

    const hasBodyFilter = bodyTypes.length > 0;
    const vehicleJoin = hasBodyFilter ? "vehicle:vehicles!inner" : "vehicle:vehicles";
    let q: any = supabase
      .from("leads")
      .select(
        `id, customer_name, phone, email, registration_number, stage, owner_id, lead_score, source, created_at, last_activity_at, city, archived_at, pin_inbox_at, is_pinned, submission_count, last_submission_at,
         ${vehicleJoin}(brand, model, version, year, mileage_mil, fuel, gearbox, body_type, drive_type, service_book, tires, keys_count, condition, damage_notes, inspection_until),
         pricing:pricing(customer_expectation, valuation_from, valuation_to, in_price, out_price, in_price_from, in_price_to, out_price_from, out_price_to)`,
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    // Stage-grupp har företräde över enskild stage.
    if (stageGroup === "arkiv") {
      q = q.not("archived_at", "is", null);
    } else if (stageGroup === "publicerad") {
      // Leads som har minst en publicering OCH står i stage `matchad`
      // (= pågående auktion). Publikationsrader lever kvar efter att en
      // vinnare valts — utan stage-filtret skulle vunna/aktiva affärer
      // ligga kvar i den här kolumnen för alltid.
      const { data: pubs } = await supabase
        .from("lead_dealer_publications")
        .select("lead_id");
      const ids = Array.from(new Set((pubs ?? []).map((r: any) => r.lead_id as string)));
      if (ids.length === 0) {
        return [];
      }
      q = q.in("id", ids).eq("stage", "matchad").is("archived_at", null);
    } else if (stageGroup === "godkand_pris") {
      // Matchade leads som ännu INTE publicerats (annars dubblett av "publicerad").
      const { data: pubs } = await supabase
        .from("lead_dealer_publications")
        .select("lead_id");
      const ids = Array.from(new Set((pubs ?? []).map((r: any) => r.lead_id as string)));
      q = q.eq("stage", "matchad").is("archived_at", null);
      if (ids.length > 0) q = q.not("id", "in", `(${ids.join(",")})`);
    } else if (stageGroup && stageGroup in STAGE_GROUP_TO_DB) {
      const stages = STAGE_GROUP_TO_DB[stageGroup as StageGroup];
      if (stages.length === 0) return [];
      q = q.in("stage", stages).is("archived_at", null);
    } else if (stage === "arkiverad") {
      q = q.not("archived_at", "is", null);
    } else if (stage && REAL_STAGES.includes(stage as LeadStage)) {
      q = q.eq("stage", stage as LeadStage).is("archived_at", null);
    } else if (qStr) {
      q = q.is("archived_at", null);
    } else {
      q = q.is("archived_at", null).limit(50);
    }

    if (hasBodyFilter) {
      q = q.in("vehicles.body_type", bodyTypes);
    }

    if (qStr) {
      const esc = qStr.replace(/[%,()]/g, " ").trim();
      const like = `%${esc}%`;
      q = q.or(
        `customer_name.ilike.${like},phone.ilike.${like},email.ilike.${like},registration_number.ilike.${like},city.ilike.${like}`,
      );
    }

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({
      ...r,
      vehicle: Array.isArray(r.vehicle) ? r.vehicle[0] ?? null : r.vehicle ?? null,
      pricing: Array.isArray(r.pricing) ? r.pricing[0] ?? null : r.pricing ?? null,
    })) as LeadRow[];
  });


export const getStageCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("leads")
      .select("stage, archived_at");
    if (error) throw new Error(error.message);
    const counts: Record<string, number> = {};
    let archived = 0;
    for (const row of data ?? []) {
      if (row.archived_at) {
        archived += 1;
        continue;
      }
      counts[row.stage as string] = (counts[row.stage as string] ?? 0) + 1;
    }
    counts.arkiverad = archived;
    return counts;
  });

// Räkna leads per presentations-grupp (för dashboard-band).
export const getStageGroupCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [{ data: leads, error: le }, { data: pubs }] = await Promise.all([
      supabase.from("leads").select("id, stage, archived_at"),
      supabase.from("lead_dealer_publications").select("lead_id"),
    ]);
    if (le) throw new Error(le.message);
    const publishedIds = new Set((pubs ?? []).map((r: any) => r.lead_id as string));
    const counts: Record<StageGroup, number> = {
      behover_varderas: 0, kontakt_1: 0, kontakt_2: 0, kontakt_3: 0,
      inget_svar: 0, godkand_pris: 0, publicerad: 0, aktiv_affar: 0,
      vunnen: 0, forlorad: 0, arkiv: 0,
    };
    for (const row of leads ?? []) {
      const r = row as any;
      if (r.archived_at) { counts.arkiv += 1; continue; }
      // "Publicerad" = pågående auktion (stage matchad + publicerad).
      // Efter vinnarval (bud_mottaget m.fl.) räknas leadet i sin riktiga grupp.
      if (r.stage === "matchad" && publishedIds.has(r.id)) { counts.publicerad += 1; continue; }
      for (const [group, stages] of Object.entries(STAGE_GROUP_TO_DB) as [StageGroup, LeadStage[]][]) {
        if (stages.includes(r.stage as LeadStage)) { counts[group] += 1; break; }
      }
    }
    return counts;
  });


const createLeadSchema = z.object({
  customer_name: z.string().trim().max(200).optional().nullable(),
  phone: z.string().trim().min(4).max(32),
  email: z.string().trim().email().max(255),
  registration_number: z.string().trim().min(2).max(16),
  city: z.string().trim().max(100).optional().nullable(),
  region: z.string().trim().max(100).optional().nullable(),
  free_text: z.string().trim().max(4000).optional().nullable(),
  gdpr_consent: z.boolean().optional().default(false),
  vehicle: z
    .object({
      brand: z.string().trim().max(100).optional().nullable(),
      model: z.string().trim().max(100).optional().nullable(),
      year: z.number().int().min(1900).max(2100).optional().nullable(),
      mileage_mil: z.number().int().min(0).max(100000).optional().nullable(),
      fuel: z.string().trim().max(50).optional().nullable(),
      gearbox: z.string().trim().max(50).optional().nullable(),
    })
    .optional(),
});

function normalizeFuelForDb(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  const legacy: Record<string, string> = {
    hybrid: "hybrid_bensin",
    plugin_hybrid: "plugin_bensin",
    electric: "el",
    gas: "fordonsgas",
    ethanol: "etanol",
    other: "okant",
  };
  const normalized = legacy[v] ?? v;
  return FUEL_VALUES.includes(normalized as any) ? normalized : null;
}

function normalizeGearboxForDb(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  const legacy: Record<string, string> = {
    automatic: "automatisk",
    manual: "manuell",
    unknown: "okant",
  };
  const normalized = legacy[v] ?? v;
  return GEARBOX_VALUES.includes(normalized as any) ? normalized : null;
}

export const createLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createLeadSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const now = new Date().toISOString();

    // If the creator is an admin, leave owner_id NULL so the lead lands in
    // the unassigned pool and is visible to all sellers (seller RLS only
    // allows owner_id = auth.uid() OR owner_id IS NULL).
    const { data: creatorProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    const creatorIsAdmin = (creatorProfile as any)?.role === "admin";

    const payload: any = {
      customer_name: data.customer_name ?? null,
      phone: data.phone,
      email: data.email,
      registration_number: data.registration_number.toUpperCase().replace(/\s+/g, ""),
      city: data.city ?? null,
      region: data.region ?? null,
      free_text: data.free_text ?? null,
      gdpr_consent: data.gdpr_consent ?? false,
      consent_timestamp: data.gdpr_consent ? now : null,
      source: "manual",
      stage: "ny_lead",
      owner_id: creatorIsAdmin ? null : userId,
      owned_at: creatorIsAdmin ? null : now,
    };
    const { data: lead, error } = await supabase
      .from("leads")
      .insert(payload as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const leadId = (lead as any).id as string;

    const v = data.vehicle;
    const fuel = normalizeFuelForDb(v?.fuel);
    const gearbox = normalizeGearboxForDb(v?.gearbox);
    if (v && (v.brand || v.model || v.year || v.mileage_mil || fuel || gearbox)) {
      const { error: vErr } = await supabase.from("vehicles").insert({
        lead_id: leadId,
        brand: v.brand ?? null,
        model: v.model ?? null,
        year: v.year ?? null,
        mileage_mil: v.mileage_mil ?? null,
        fuel,
        gearbox,
      } as never);
      if (vErr) throw new Error(vErr.message);
    }

    await supabase.from("audit_logs").insert({
      user_id: userId,
      action: "lead_created_manual",
      object_type: "lead",
      object_id: leadId,
      new_value: payload as never,
    } as never);

    try {
      const { runAutomaticLeadValuation } = await import("@/lib/valuation/auto-valuation.server");
      await runAutomaticLeadValuation(leadId);
    } catch (autoErr) {
      const message = autoErr instanceof Error ? autoErr.message : String(autoErr);
      console.error("manual lead automatic valuation failed", autoErr);
      await supabase.from("activity_timeline").insert({
        lead_id: leadId,
        type: "auto_valuation_failed",
        description: `Automatisk värdering kunde inte köras: ${message}`,
        actor_id: userId,
        actor_type: "seller",
        metadata: { error: message } as never,
      } as never);
    }

    return { leadId };
  });

// Radera lead permanent. Endast admin eller lead-ägaren får radera.
// FK:er på vehicles/pricing/notes/messages/etc. har ON DELETE CASCADE.
export const deleteLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ leadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Hämta leadet för auktorisering + audit-info
    const { data: lead, error: fetchErr } = await supabase
      .from("leads")
      .select("id, owner_id, registration_number, stage")
      .eq("id", data.leadId)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!lead) throw new Error("Lead hittades inte");

    // Admin-kontroll via profiles.role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    const isAdmin = (profile as any)?.role === "admin";
    const isOwner = (lead as any).owner_id === userId;
    if (!isAdmin && !isOwner) {
      throw new Error("Du har inte behörighet att radera detta lead");
    }

    const { error: delErr } = await supabase.from("leads").delete().eq("id", data.leadId);
    if (delErr) throw new Error(delErr.message);

    await supabase.from("audit_logs").insert({
      user_id: userId,
      action: "lead_deleted",
      object_type: "lead",
      object_id: data.leadId,
      old_value: lead as never,
    } as never);

    return { ok: true };
  });

// Pinna/avpinna en lead på kanban-tavlan.
export const toggleLeadPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ leadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: cur, error: selErr } = await supabase
      .from("leads")
      .select("is_pinned")
      .eq("id", data.leadId)
      .single();
    if (selErr) throw new Error(selErr.message);
    const next = !(cur as any)?.is_pinned;
    const { error } = await supabase
      .from("leads")
      .update({ is_pinned: next })
      .eq("id", data.leadId);
    if (error) throw new Error(error.message);
    return { ok: true, is_pinned: next };
  });
