// Server-only geocoding via Nominatim with city-cache.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type GeoResult = { lat: number; lng: number; region: string | null };

export async function geocodeCity(cityName: string): Promise<GeoResult | null> {
  const normalized = cityName.trim().toLowerCase();
  if (!normalized) return null;

  // 1. cache
  const { data: cached } = await supabaseAdmin
    .from("cities")
    .select("latitude, longitude, region")
    .eq("name", normalized)
    .maybeSingle();
  if (cached) return { lat: cached.latitude, lng: cached.longitude, region: cached.region };

  // 2. Nominatim
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cityName)},+Sweden&format=json&limit=1&addressdetails=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": "MinBilVardering/1.0 (kontakt@minbilvardering.se)" },
    });
    if (!res.ok) return null;
    const data: any[] = await res.json();
    if (!data || data.length === 0) return null;
    const r = data[0];
    const lat = parseFloat(r.lat);
    const lng = parseFloat(r.lon);
    const region: string | null = r.address?.state ?? r.address?.county ?? null;
    if (!isFinite(lat) || !isFinite(lng)) return null;

    // 3. cache (ignore conflict)
    await supabaseAdmin.from("cities").insert({
      name: normalized,
      display_name: cityName.trim(),
      region,
      latitude: lat,
      longitude: lng,
    } as never);

    return { lat, lng, region };
  } catch (e) {
    console.error("Nominatim geocode failed:", e);
    return null;
  }
}

// Geocode a lead's pickup_location|city and persist on the lead row.
export async function geocodeLeadInBackground(leadId: string): Promise<void> {
  try {
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("city, pickup_location, region")
      .eq("id", leadId)
      .single();
    if (!lead) return;
    const target = (lead as any).pickup_location || lead.city;
    if (!target) return;
    const geo = await geocodeCity(target);
    if (!geo) return;
    await supabaseAdmin
      .from("leads")
      .update({
        latitude: geo.lat,
        longitude: geo.lng,
        region: lead.region ?? geo.region ?? null,
      } as never)
      .eq("id", leadId);
  } catch (e) {
    console.error("geocodeLeadInBackground failed:", e);
  }
}
