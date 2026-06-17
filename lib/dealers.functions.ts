// Dealer admin + matching server functions.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { findMatchingDealers } from "@/lib/dealer-matching.server";
import { geocodeCity } from "@/lib/geocoding.server";

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  if ((data as any)?.role !== "admin") {
    throw new Error("Endast admin har åtkomst");
  }
}

const dealerSchema = z.object({
  company_name: z.string().min(1).max(200),
  org_number: z.string().max(20).optional().nullable(),
  contact_person: z.string().max(200).optional().nullable(),
  email: z.string().email().max(255),
  phone: z.string().max(20).optional().nullable(),
  address: z.string().max(255).optional().nullable(),
  postal_code: z.string().max(20).optional().nullable(),
  city: z.string().min(1).max(100),
  region: z.string().max(100).optional().nullable(),
  buying_radius_km: z.number().int().min(0).max(2000).default(50),
  preferred_brands: z.array(z.string().max(100)).max(50).default([]),
  preferred_vehicle_types: z.array(z.string().max(40)).max(20).default([]),
  preferred_fuels: z
    .array(z.enum(["bensin", "diesel", "hybrid", "plugin_hybrid", "electric", "gas", "ethanol", "other"]))
    .default([]),
  max_mileage_mil: z.number().int().min(0).nullable().optional(),
  min_year: z.number().int().min(1900).max(2100).nullable().optional(),
  price_range_from: z.number().int().min(0).nullable().optional(),
  price_range_to: z.number().int().min(0).nullable().optional(),
  notify_via_email: z.boolean().default(true),
  notify_via_sms: z.boolean().default(false),
  notify_only_preferred_brands: z.boolean().default(false),
  notify_only_within_radius: z.boolean().default(true),
  pricing_model: z.enum(["per_lead", "per_won_deal", "monthly_fee", "custom"]).default("per_lead"),
  price_per_lead: z.number().int().min(0).nullable().optional(),
  price_per_won_deal: z.number().int().min(0).nullable().optional(),
  monthly_fee: z.number().int().min(0).nullable().optional(),
  custom_terms: z.string().max(2000).optional().nullable(),
  status: z.enum(["active", "paused", "inactive"]).default("active"),
  internal_notes: z.string().max(4000).optional().nullable(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
});

export const listDealers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        search: z.string().max(200).optional(),
        status: z.string().max(20).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId!);
    let q = supabaseAdmin.from("dealers").select("*").order("company_name");
    if (data.status) q = q.eq("status", data.status);
    if (data.search) q = q.or(`company_name.ilike.%${data.search}%,email.ilike.%${data.search}%,org_number.ilike.%${data.search}%`);
    const { data: rows, error } = await q.limit(500);
    if (error) throw error;
    return { dealers: rows ?? [] };
  });

export const getDealer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ dealerId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId!);
    const [{ data: dealer }, { data: users }] = await Promise.all([
      supabaseAdmin.from("dealers").select("*").eq("id", data.dealerId).single(),
      supabaseAdmin
        .from("dealer_users")
        .select("user_id, is_primary, created_at, last_login_at")
        .eq("dealer_id", data.dealerId),
    ]);
    // fetch user emails
    let userEmails: Record<string, string> = {};
    if (users && users.length > 0) {
      const ids = users.map((u: any) => u.user_id);
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, email")
        .in("id", ids);
      userEmails = Object.fromEntries(((profiles ?? []) as any[]).map((p) => [p.id, p.email]));
    }
    return {
      dealer,
      users: (users ?? []).map((u: any) => ({ ...u, email: userEmails[u.user_id] ?? null })),
    };
  });

export const upsertDealer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ id: z.string().uuid().nullable().optional(), data: dealerSchema })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId!);
    let payload: any = { ...data.data };
    // Auto-geocode if lat/lng not set or city changed
    if ((payload.latitude == null || payload.longitude == null) && payload.city) {
      const geo = await geocodeCity(payload.city);
      if (geo) {
        payload.latitude = geo.lat;
        payload.longitude = geo.lng;
        if (!payload.region && geo.region) payload.region = geo.region;
      }
    }
    if (data.id) {
      const { data: row, error } = await supabaseAdmin
        .from("dealers")
        .update(payload as never)
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw error;
      await supabaseAdmin.from("audit_logs").insert({
        user_id: context.userId,
        action: "dealer_updated",
        object_type: "dealer",
        object_id: data.id,
        new_value: payload as never,
      } as never);
      return { dealer: row };
    }
    const { data: row, error } = await supabaseAdmin
      .from("dealers")
      .insert(payload as never)
      .select()
      .single();
    if (error) throw error;
    await supabaseAdmin.from("audit_logs").insert({
      user_id: context.userId,
      action: "dealer_created",
      object_type: "dealer",
      object_id: (row as any).id,
      new_value: payload as never,
    } as never);
    return { dealer: row };
  });

export const inviteDealerUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ dealerId: z.string().uuid(), email: z.string().email() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId!);
    // Use admin auth to invite
    const { data: invited, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      data: { role: "dealer", dealer_id: data.dealerId },
    });
    if (error) throw error;
    const newUserId = invited.user?.id;
    if (!newUserId) throw new Error("Inbjudan misslyckades");
    // upsert dealer_users
    await supabaseAdmin
      .from("dealer_users")
      .upsert({ user_id: newUserId, dealer_id: data.dealerId } as never, { onConflict: "user_id" });
    // update profile role
    await supabaseAdmin
      .from("profiles")
      .update({ role: "dealer" as never } as never)
      .eq("id", newUserId);
    return { ok: true, user_id: newUserId };
  });

export const removeDealerUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId!);
    const { error } = await supabaseAdmin.from("dealer_users").delete().eq("user_id", data.userId);
    if (error) throw error;
    return { ok: true };
  });

export const matchDealersForLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ leadId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const matches = await findMatchingDealers(data.leadId);
    return { matches };
  });

export const listAllActiveDealers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId!);
    const { data, error } = await supabaseAdmin
      .from("dealers")
      .select("id, company_name, city, region")
      .eq("status", "active")
      .order("company_name");
    if (error) throw error;
    return { dealers: data ?? [] };
  });
