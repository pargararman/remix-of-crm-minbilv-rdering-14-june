// Dealer-facing server functions.
//
// SÄKERHETSMODELL (omskriven 2026-06-12):
// Handlare har INGEN direkt RLS-läsning på leads/vehicles längre (PII-skydd —
// kundnamn/telefon/e-post får aldrig nå en handlare före vunnen affär).
// All data går via dessa funktioner: vi verifierar publikation/vinst för
// handlaren och returnerar därefter ett anonymiserat DTO byggt med
// admin-klienten. Delningsflaggorna på publikationen efterlevs här.
import { createServerFn } from "@tanstack/react-start";
import { requireDealer } from "@/integrations/supabase/role-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

const leadIdSchema = z.object({ leadId: z.string().uuid() });

// Stadier där en vunnen budgivning fortfarande är "pågående affär" för handlaren.
const ACTIVE_DEAL_STAGES = ["bud_mottaget", "kund_accepterat", "kontrakt_pagar_avtal", "hamtning"] as const;
const WON_DEAL_STAGES = ["vunnen"] as const;

function must<T>(res: { data: T; error: { message: string } | null }, label: string): NonNullable<T> {
  if (res.error) throw new Error(`${label}: ${res.error.message}`);
  if (res.data == null) throw new Error(`${label}: hittades inte`);
  return res.data as NonNullable<T>;
}

async function getPublication(dealerId: string, leadId: string) {
  const { data, error } = await supabaseAdmin
    .from("lead_dealer_publications")
    .select("id, dealer_comment, share_photos, share_city, include_pricing_range")
    .eq("lead_id", leadId)
    .eq("dealer_id", dealerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

// Batch: högsta bud + handlarens högsta bud för en mängd leads (undviker N+1).
async function bidSummaries(leadIds: string[], dealerId: string) {
  const map = new Map<string, { highest: number | null; mine: number | null }>();
  if (leadIds.length === 0) return map;
  const { data, error } = await supabaseAdmin
    .from("auction_bids")
    .select("lead_id, dealer_id, amount")
    .in("lead_id", leadIds);
  if (error) throw new Error(error.message);
  for (const b of data ?? []) {
    const cur = map.get(b.lead_id) ?? { highest: null, mine: null };
    if (cur.highest === null || b.amount > cur.highest) cur.highest = b.amount;
    if (b.dealer_id === dealerId && (cur.mine === null || b.amount > cur.mine)) cur.mine = b.amount;
    map.set(b.lead_id, cur);
  }
  return map;
}

export type AuctionBidPublic = {
  bidNumber: number;
  amount: number;
  createdAt: string;
  isMine: boolean;
};

export type AuctionPublicState = {
  highestBid: number | null;
  activeBidderCount: number;
  bidCount: number;
  closesAt: string | null;
  endedAt: string | null;
  history: AuctionBidPublic[];
};

export type MyBidStatus = {
  myHighestBid: number | null;
  highestBid: number | null;
  status: "leading" | "outbid" | "no_bid";
  closesAt: string | null;
  endedAt: string | null;
};

export type DealerCarSummary = {
  leadId: string;
  registrationNumber: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  mileageMil: number | null;
  fuel: string | null;
  gearbox: string | null;
  city: string | null;
  highestBid: number | null;
  myHighestBid: number | null;
  closesAt: string | null;
  endedAt: string | null;
};

// --- Available cars (matchad stage, published to this dealer) ---
export const listAvailableCars = createServerFn({ method: "GET" })
  .middleware([requireDealer])
  .handler(async ({ context }): Promise<DealerCarSummary[]> => {
    const dealerId = (context as any).dealerId as string;

    const pubs = must(
      await supabaseAdmin
        .from("lead_dealer_publications")
        .select("lead_id, share_city")
        .eq("dealer_id", dealerId),
      "publications",
    );
    if (!pubs?.length) return [];
    const shareCity = new Map(pubs.map((p: any) => [p.lead_id, p.share_city !== false]));

    const leads = must(
      await supabaseAdmin
        .from("leads")
        .select(
          "id, registration_number, city, stage, auction_closes_at, auction_ended_at, vehicles(brand, model, year, mileage_mil, fuel, gearbox)",
        )
        .in("id", pubs.map((p: any) => p.lead_id))
        .eq("stage", "matchad"),
      "leads",
    );

    const ids = (leads ?? []).map((l: any) => l.id);
    const bids = await bidSummaries(ids, dealerId);

    return (leads ?? []).map((l: any) => {
      const v = Array.isArray(l.vehicles) ? l.vehicles[0] : l.vehicles;
      const b = bids.get(l.id) ?? { highest: null, mine: null };
      return {
        leadId: l.id,
        registrationNumber: l.registration_number,
        brand: v?.brand ?? null,
        model: v?.model ?? null,
        year: v?.year ?? null,
        mileageMil: v?.mileage_mil ?? null,
        fuel: v?.fuel ?? null,
        gearbox: v?.gearbox ?? null,
        city: shareCity.get(l.id) ? (l.city ?? null) : null,
        highestBid: b.highest,
        myHighestBid: b.mine,
        closesAt: l.auction_closes_at,
        endedAt: l.auction_ended_at,
      };
    });
  });

// --- Car detail (safe DTO, respekterar delningsflaggor) ---
export const getDealerCarDetail = createServerFn({ method: "GET" })
  .middleware([requireDealer])
  .inputValidator((d) => leadIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const dealerId = (context as any).dealerId as string;

    const pub = await getPublication(dealerId, data.leadId);
    if (!pub) throw new Error("forbidden");

    const lead = must(
      await supabaseAdmin
        .from("leads")
        .select(
          "id, registration_number, city, stage, auction_closes_at, auction_ended_at, winning_dealer_id, equipment_notes, free_text",
        )
        .eq("id", data.leadId)
        .single(),
      "lead",
    );

    const { data: vehicle } = await supabaseAdmin
      .from("vehicles")
      .select(
        "brand, model, year, mileage_mil, fuel, gearbox, color, body_type, service_book, num_keys, num_owners, last_inspection",
      )
      .eq("lead_id", data.leadId)
      .maybeSingle();

    // Delningsflaggor från publikationen.
    const sharePhotos = pub.share_photos !== false;
    const shareCity = pub.share_city !== false;
    const includePricing = pub.include_pricing_range === true;

    const photos: any[] = [];
    const documents: any[] = [];
    if (sharePhotos) {
      const { data: fileRows } = await supabaseAdmin
        .from("files")
        .select("id, storage_path, thumbnail_url, file_type, caption, category, created_at")
        .eq("lead_id", data.leadId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      for (const f of fileRows ?? []) {
        const isImage = (f.file_type ?? "").startsWith("image/");
        const bucket = isImage ? "lead-photos" : "lead-documents";
        const { data: signed } = await supabaseAdmin.storage
          .from(bucket)
          .createSignedUrl(f.storage_path, 3600);
        let thumbUrl: string | null = null;
        if (f.thumbnail_url) {
          const { data: t } = await supabaseAdmin.storage
            .from("lead-photos")
            .createSignedUrl(f.thumbnail_url, 3600);
          thumbUrl = t?.signedUrl ?? null;
        }
        const url = signed?.signedUrl ?? null;
        if (!url) continue;
        if (isImage) {
          photos.push({ id: f.id, url, thumbUrl: thumbUrl ?? url, caption: f.caption, category: f.category });
        } else {
          const name = f.storage_path.split("/").pop() ?? "fil";
          documents.push({ id: f.id, url, name, fileType: f.file_type });
        }
      }
    }

    // Värderingsintervall — visas endast om säljaren valt att dela det.
    let pricingRange: { from: number; to: number } | null = null;
    if (includePricing) {
      const { data: pricing } = await supabaseAdmin
        .from("pricing")
        .select("valuation_from, valuation_to")
        .eq("lead_id", data.leadId)
        .maybeSingle();
      if (pricing?.valuation_from != null && pricing?.valuation_to != null) {
        pricingRange = { from: pricing.valuation_from, to: pricing.valuation_to };
      }
    }

    const { data: noteRows } = await supabaseAdmin
      .from("notes")
      .select("id, content, created_at, author:profiles!notes_created_by_fkey(name)")
      .eq("lead_id", data.leadId)
      .eq("visibility", "dealer_visible")
      .order("created_at", { ascending: false });
    const notes = (noteRows ?? []).map((n: any) => ({
      id: n.id,
      content: n.content,
      createdAt: n.created_at,
      authorName: n.author?.name ?? null,
    }));

    return {
      lead: {
        id: lead.id,
        registrationNumber: lead.registration_number,
        city: shareCity ? lead.city : null,
        stage: lead.stage,
        closesAt: lead.auction_closes_at,
        endedAt: lead.auction_ended_at,
        winningDealerId: lead.winning_dealer_id,
        equipmentNotes: lead.equipment_notes,
        freeText: lead.free_text,
      },
      vehicle: vehicle ?? null,
      publication: { dealerComment: pub.dealer_comment },
      pricingRange,
      photos,
      documents,
      notes,
      isWinner: lead.winning_dealer_id === dealerId,
    };
  });

// --- Auction public state (anonymized) ---
export const getAuctionPublicState = createServerFn({ method: "GET" })
  .middleware([requireDealer])
  .inputValidator((d) => leadIdSchema.parse(d))
  .handler(async ({ data, context }): Promise<AuctionPublicState> => {
    const dealerId = (context as any).dealerId as string;

    const pub = await getPublication(dealerId, data.leadId);
    if (!pub) throw new Error("forbidden");

    const lead = must(
      await supabaseAdmin
        .from("leads")
        .select("auction_closes_at, auction_ended_at")
        .eq("id", data.leadId)
        .single(),
      "lead",
    );

    const rows = must(
      await supabaseAdmin
        .from("auction_bids")
        .select("bid_number, amount, created_at, dealer_id")
        .eq("lead_id", data.leadId)
        .order("bid_number", { ascending: false }),
      "bids",
    ) ?? [];

    const highest: number | null = rows.reduce(
      (m: number | null, b: any) => (m === null || b.amount > m ? b.amount : m),
      null as number | null,
    );
    const distinct = new Set(rows.map((b: any) => b.dealer_id));

    return {
      highestBid: highest,
      activeBidderCount: distinct.size,
      bidCount: rows.length,
      closesAt: lead.auction_closes_at,
      endedAt: lead.auction_ended_at,
      history: rows.map((b: any) => ({
        bidNumber: b.bid_number,
        amount: b.amount,
        createdAt: b.created_at,
        isMine: b.dealer_id === dealerId,
      })),
    };
  });

// --- My bid status ---
export const getMyBidStatus = createServerFn({ method: "GET" })
  .middleware([requireDealer])
  .inputValidator((d) => leadIdSchema.parse(d))
  .handler(async ({ data, context }): Promise<MyBidStatus> => {
    const dealerId = (context as any).dealerId as string;

    const pub = await getPublication(dealerId, data.leadId);
    if (!pub) throw new Error("forbidden");

    const lead = must(
      await supabaseAdmin
        .from("leads")
        .select("auction_closes_at, auction_ended_at")
        .eq("id", data.leadId)
        .single(),
      "lead",
    );

    const bids = await bidSummaries([data.leadId], dealerId);
    const b = bids.get(data.leadId) ?? { highest: null, mine: null };

    let status: MyBidStatus["status"] = "no_bid";
    if (b.mine !== null && b.highest !== null) {
      status = b.mine >= b.highest ? "leading" : "outbid";
    }

    return {
      myHighestBid: b.mine,
      highestBid: b.highest,
      status,
      closesAt: lead.auction_closes_at,
      endedAt: lead.auction_ended_at,
    };
  });

// --- Place bid ---
export const placeBid = createServerFn({ method: "POST" })
  .middleware([requireDealer])
  .inputValidator((d) =>
    z.object({ leadId: z.string().uuid(), amount: z.number().int().positive().max(99_999_999) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const dealerId = (context as any).dealerId as string;

    // Vem ledde innan budet? (för överbuds-notis)
    const before = await bidSummaries([data.leadId], dealerId);
    const prevHighest = before.get(data.leadId)?.highest ?? null;

    // RPC:n place_bid gör auktoritetskontrollerna (radlås, auktion öppen,
    // publikation, minsta höjning) — körs med användarens JWT.
    const { data: res, error } = await supabase.rpc("place_bid", {
      _lead_id: data.leadId,
      _amount: data.amount,
    });
    if (error) throw new Error(error.message);

    // Notifiera tidigare ledande handlare om överbud (best-effort).
    try {
      if (prevHighest !== null) {
        const { data: prevTop } = await supabaseAdmin
          .from("auction_bids")
          .select("dealer_id")
          .eq("lead_id", data.leadId)
          .eq("amount", prevHighest)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        const outbidDealerId = (prevTop as any)?.dealer_id;
        if (outbidDealerId && outbidDealerId !== dealerId) {
          const { notifyDealerOutbid } = await import("@/lib/dealer-notifications.server");
          await notifyDealerOutbid({
            dealerId: outbidDealerId,
            leadId: data.leadId,
            newHighestBid: data.amount,
          });
        }
      }
    } catch (e) {
      console.error("notifyDealerOutbid failed:", e);
    }

    return res;
  });

// --- Active deals (won auction, deal in progress) ---
export const listMyActiveDeals = createServerFn({ method: "GET" })
  .middleware([requireDealer])
  .handler(async ({ context }) => {
    const dealerId = (context as any).dealerId as string;
    const leads = must(
      await supabaseAdmin
        .from("leads")
        .select("id, registration_number, city, stage, auction_ended_at, vehicles(brand, model, year)")
        .eq("winning_dealer_id", dealerId)
        .in("stage", [...ACTIVE_DEAL_STAGES]),
      "active deals",
    );
    const ids = (leads ?? []).map((l: any) => l.id);
    const bids = await bidSummaries(ids, dealerId);
    return (leads ?? []).map((l: any) => {
      const v = Array.isArray(l.vehicles) ? l.vehicles[0] : l.vehicles;
      return {
        leadId: l.id,
        registrationNumber: l.registration_number,
        city: l.city,
        stage: l.stage,
        brand: v?.brand ?? null,
        model: v?.model ?? null,
        year: v?.year ?? null,
        winningBid: bids.get(l.id)?.mine ?? null,
      };
    });
  });

// --- Won deals (completed) ---
export const listMyWonDeals = createServerFn({ method: "GET" })
  .middleware([requireDealer])
  .handler(async ({ context }) => {
    const dealerId = (context as any).dealerId as string;
    const leads = must(
      await supabaseAdmin
        .from("leads")
        .select("id, registration_number, city, stage, archived_at, vehicles(brand, model, year)")
        .eq("winning_dealer_id", dealerId)
        .in("stage", [...WON_DEAL_STAGES, "arkiverad"]),
      "won deals",
    );
    // Arkiverade räknas som vunna endast om de gick via vunnen
    // (winning_dealer_id satt + won_deals-rad finns).
    const ids = (leads ?? []).map((l: any) => l.id);
    let wonIds = new Set<string>(ids);
    const archived = (leads ?? []).filter((l: any) => l.stage === "arkiverad").map((l: any) => l.id);
    if (archived.length > 0) {
      const { data: wd } = await supabaseAdmin
        .from("won_deals")
        .select("lead_id")
        .in("lead_id", archived)
        .eq("dealer_id", dealerId);
      const confirmed = new Set((wd ?? []).map((r: any) => r.lead_id));
      wonIds = new Set(ids.filter((id: string) => !archived.includes(id) || confirmed.has(id)));
    }
    return (leads ?? [])
      .filter((l: any) => wonIds.has(l.id))
      .map((l: any) => {
        const v = Array.isArray(l.vehicles) ? l.vehicles[0] : l.vehicles;
        return {
          leadId: l.id,
          registrationNumber: l.registration_number,
          city: l.city,
          stage: l.stage,
          brand: v?.brand ?? null,
          model: v?.model ?? null,
          year: v?.year ?? null,
        };
      });
  });

// --- My bids list ---
export const listMyBids = createServerFn({ method: "GET" })
  .middleware([requireDealer])
  .handler(async ({ context }) => {
    const dealerId = (context as any).dealerId as string;
    const bids = must(
      await supabaseAdmin
        .from("auction_bids")
        .select(
          "lead_id, amount, bid_number, created_at, leads(registration_number, auction_closes_at, auction_ended_at, winning_dealer_id, vehicles(brand, model, year))",
        )
        .eq("dealer_id", dealerId)
        .order("created_at", { ascending: false }),
      "my bids",
    );
    return (bids ?? []).map((b: any) => {
      const v = Array.isArray(b.leads?.vehicles) ? b.leads.vehicles[0] : b.leads?.vehicles;
      return {
        leadId: b.lead_id,
        amount: b.amount,
        bidNumber: b.bid_number,
        createdAt: b.created_at,
        registrationNumber: b.leads?.registration_number,
        closesAt: b.leads?.auction_closes_at,
        endedAt: b.leads?.auction_ended_at,
        won: b.leads?.winning_dealer_id === dealerId,
        brand: v?.brand ?? null,
        model: v?.model ?? null,
        year: v?.year ?? null,
      };
    });
  });
