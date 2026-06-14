// Seller-side auction functions. Returns dealer identity for the CRM.
import { createServerFn } from "@tanstack/react-start";
import { requireStaff } from "@/integrations/supabase/role-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

const leadIdSchema = z.object({ leadId: z.string().uuid() });

export const listAuctionBidsForLead = createServerFn({ method: "GET" })
  .middleware([requireStaff])
  .inputValidator((d) => leadIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { data: lead, error: le } = await supabase
      .from("leads")
      .select("auction_closes_at, auction_ended_at, winning_dealer_id, stage")
      .eq("id", data.leadId)
      .single();
    if (le) throw new Error(le.message);
    const { data: bids, error: be } = await supabase
      .from("auction_bids")
      .select("id, bid_number, amount, created_at, dealer_id, dealers(company_name)")
      .eq("lead_id", data.leadId)
      .order("created_at", { ascending: false });
    if (be) throw new Error(be.message);
    return {
      closesAt: lead?.auction_closes_at ?? null,
      endedAt: lead?.auction_ended_at ?? null,
      winningDealerId: lead?.winning_dealer_id ?? null,
      stage: lead?.stage ?? null,
      bids: (bids ?? []).map((b: any) => ({
        id: b.id,
        bidNumber: b.bid_number,
        amount: b.amount,
        createdAt: b.created_at,
        dealerId: b.dealer_id,
        dealerName: b.dealers?.company_name ?? "Okänd",
      })),
    };
  });

export const selectWinningDealer = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((d) =>
    z
      .object({
        leadId: z.string().uuid(),
        dealerId: z.string().uuid(),
        // Krävs när auktionen fortfarande pågår — tidigt avslut måste
        // bekräftas explicit i UI:t och audit-loggas separat.
        confirmEarly: z.boolean().optional().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const userId = (context as any).userId as string;

    // Tidigt avslut? (auktion ej markerad avslutad och stängningstid i framtiden)
    const { data: lead, error: le } = await supabase
      .from("leads")
      .select("auction_closes_at, auction_ended_at")
      .eq("id", data.leadId)
      .single();
    if (le) throw new Error(le.message);
    const auctionStillOpen =
      !lead?.auction_ended_at &&
      lead?.auction_closes_at &&
      new Date(lead.auction_closes_at).getTime() > Date.now();

    if (auctionStillOpen && !data.confirmEarly) {
      throw new Error(
        "auction_still_open: auktionen pågår — tidigt avslut kräver bekräftelse",
      );
    }

    const { error } = await supabase.rpc("select_winning_dealer", {
      _lead_id: data.leadId,
      _dealer_id: data.dealerId,
    });
    if (error) throw new Error(error.message);

    // Audit-logga tidigt avslut särskilt (rättvisefråga mot övriga budgivare).
    if (auctionStillOpen) {
      await supabaseAdmin.from("audit_logs").insert({
        user_id: userId,
        action: "winner_selected_early",
        object_type: "lead",
        object_id: data.leadId,
        new_value: {
          dealer_id: data.dealerId,
          scheduled_close: lead.auction_closes_at,
          ended_early_at: new Date().toISOString(),
        } as never,
      } as never);
      await supabaseAdmin.from("activity_timeline").insert({
        lead_id: data.leadId,
        type: "auction_ended_early",
        description: `Auktionen avslutades i förtid av säljaren (planerad stängning ${new Date(lead.auction_closes_at).toLocaleString("sv-SE")})`,
        actor_id: userId,
        actor_type: "seller",
        metadata: { dealer_id: data.dealerId } as never,
      });
    }

    // Notifiera vinnande handlare (best-effort).
    try {
      const { data: top } = await supabaseAdmin
        .from("auction_bids")
        .select("amount")
        .eq("lead_id", data.leadId)
        .eq("dealer_id", data.dealerId)
        .order("amount", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { notifyDealerWon } = await import("@/lib/dealer-notifications.server");
      await notifyDealerWon({
        dealerId: data.dealerId,
        leadId: data.leadId,
        finalPrice: (top as any)?.amount ?? null,
      });
    } catch (e) {
      console.error("notifyDealerWon (selectWinningDealer) failed:", e);
    }

    return { ok: true };
  });

export const extendAuctionClose = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((d) =>
    z.object({ leadId: z.string().uuid(), minutes: z.number().int().min(1).max(120) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const userId = (context as any).userId as string;
    const { data: lead, error: le } = await supabase
      .from("leads")
      .select("auction_closes_at, auction_ended_at")
      .eq("id", data.leadId)
      .single();
    if (le) throw new Error(le.message);
    const base = lead?.auction_closes_at ? new Date(lead.auction_closes_at) : new Date();
    const newClose = new Date(Math.max(base.getTime(), Date.now()) + data.minutes * 60_000);
    const reopened = !!lead?.auction_ended_at;
    const { error } = await supabase
      .from("leads")
      .update({ auction_closes_at: newClose.toISOString(), auction_ended_at: null })
      .eq("id", data.leadId);
    if (error) throw new Error(error.message);

    // Audit + timeline — förlängning/återöppning av auktion är känsligt.
    await supabaseAdmin.from("activity_timeline").insert({
      lead_id: data.leadId,
      type: "auction_extended",
      description: `Auktion ${reopened ? "återöppnad och " : ""}förlängd ${data.minutes} min (stänger ${newClose.toISOString()})`,
      actor_id: userId,
      actor_type: "seller",
      metadata: { minutes: data.minutes, new_close: newClose.toISOString(), reopened } as never,
    });
    await supabaseAdmin.from("audit_logs").insert({
      user_id: userId,
      action: "auction_extended",
      object_type: "lead",
      object_id: data.leadId,
      new_value: { minutes: data.minutes, new_close: newClose.toISOString(), reopened } as never,
    } as never);

    return { ok: true, closesAt: newClose.toISOString() };
  });
