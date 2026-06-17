// Dealer matching algorithm — server-only.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type DealerMatch = {
  dealer_id: string;
  company_name: string;
  city: string;
  region: string | null;
  match_score: number;
  match_reasons: string[];
  distance_km: number | null;
  last_active_at: string | null;
  reliability_score: number | null;
};

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export async function findMatchingDealers(leadId: string): Promise<DealerMatch[]> {
  const [{ data: lead }, { data: vehicle }, { data: pricing }] = await Promise.all([
    supabaseAdmin.from("leads").select("id, city, region, latitude, longitude").eq("id", leadId).single(),
    supabaseAdmin.from("vehicles").select("*").eq("lead_id", leadId).maybeSingle(),
    supabaseAdmin.from("pricing").select("in_price, in_price_from, in_price_to").eq("lead_id", leadId).maybeSingle(),
  ]);
  if (!lead) return [];

  const { data: dealers } = await supabaseAdmin
    .from("dealers")
    .select("*")
    .eq("status", "active");
  if (!dealers) return [];

  const v: any = vehicle ?? {};
  const p: any = pricing ?? {};
  const leadLat: number | null = (lead as any).latitude ?? null;
  const leadLng: number | null = (lead as any).longitude ?? null;

  const results: DealerMatch[] = [];

  for (const d of dealers as any[]) {
    // distance
    let distance_km: number | null = null;
    if (leadLat != null && leadLng != null && d.latitude != null && d.longitude != null) {
      distance_km = Math.round(haversine(leadLat, leadLng, d.latitude, d.longitude) * 10) / 10;
    }

    // hard filters
    if (
      d.notify_only_preferred_brands &&
      d.preferred_brands?.length > 0 &&
      v.brand &&
      !d.preferred_brands.includes(v.brand)
    )
      continue;

    if (
      d.notify_only_within_radius &&
      distance_km != null &&
      d.buying_radius_km != null &&
      distance_km > d.buying_radius_km
    )
      continue;

    let score = 0;
    const reasons: string[] = [];

    const sameRegion = d.region && lead.region && d.region === lead.region;
    if (sameRegion) {
      score += 40;
      reasons.push(`Samma region (${d.region})`);
    } else if (distance_km != null && d.buying_radius_km != null && distance_km <= d.buying_radius_km) {
      score += 30;
      reasons.push(`Inom köpradie (${distance_km} km)`);
    }

    if (v.brand && d.preferred_brands?.includes(v.brand)) {
      score += 20;
      reasons.push(`${v.brand}-preferens`);
    }
    if (v.mileage_mil != null && (d.max_mileage_mil == null || v.mileage_mil <= d.max_mileage_mil)) {
      if (d.max_mileage_mil != null) {
        score += 10;
        reasons.push(`Miltal passar (${v.mileage_mil} mil)`);
      }
    }
    if (v.fuel && d.preferred_fuels?.includes(v.fuel)) {
      score += 5;
      reasons.push(`Bränslepreferens (${v.fuel})`);
    }
    if (v.body_type && d.preferred_vehicle_types?.includes(v.body_type)) {
      score += 5;
      reasons.push(`Karosstyp passar (${v.body_type})`);
    }
    // Pris i intervall: använd spann (in_price_from..in_price_to) om satt, annars fall tillbaka på enskilt in_price.
    const inFrom: number | null = p.in_price_from ?? p.in_price ?? null;
    const inTo: number | null = p.in_price_to ?? p.in_price ?? null;
    if (
      inFrom != null &&
      inTo != null &&
      d.price_range_from != null &&
      d.price_range_to != null &&
      inTo >= d.price_range_from &&
      inFrom <= d.price_range_to
    ) {
      score += 5;
      reasons.push(`Pris i intervall`);
    }
    if (v.year != null && d.min_year != null && v.year >= d.min_year) {
      score += 5;
      reasons.push(`Årsmodell ok (${v.year} ≥ ${d.min_year})`);
    }

    score = Math.min(100, score);

    results.push({
      dealer_id: d.id,
      company_name: d.company_name,
      city: d.city,
      region: d.region,
      match_score: score,
      match_reasons: reasons,
      distance_km,
      last_active_at: d.last_active_at,
      reliability_score: d.reliability_score,
    });
  }

  results.sort((a, b) => b.match_score - a.match_score);
  return results;
}
