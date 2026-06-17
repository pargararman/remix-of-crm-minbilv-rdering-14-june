// Markera lead som vunnen + skapa won_deals + trigga billing.
// Synkar även handlarportalen: winning_dealer_id sätts, auktionen avslutas,
// övergången loggas via stegmotorn och handlaren notifieras.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireStaff } from "@/integrations/supabase/role-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { recordWonDealBilling } from "./billing-triggers.server";
import { attemptStageTransition } from "@/lib/automation/stage-rules.server";

export const markLeadWon = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((i) =>
    z
      .object({
        leadId: z.string().uuid(),
        dealer_id: z.string().uuid(),
        final_price: z.number().int().min(0).max(10_000_000),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const isAdmin = (context as any).isAdmin === true;
    const userId = (context as any).userId as string;

    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("id, owner_id, stage, winning_dealer_id, auction_ended_at")
      .eq("id", data.leadId)
      .maybeSingle();
    if (!lead) throw new Error("Lead saknas");

    if (!isAdmin && (lead as any).owner_id && (lead as any).owner_id !== userId)
      throw new Error("Saknar åtkomst");

    // Insert won deal
    const { error: wdErr } = await supabaseAdmin.from("won_deals").insert({
      lead_id: data.leadId,
      dealer_id: data.dealer_id,
      final_price: data.final_price,
      created_by: userId,
    } as never);
    // Dubblett (redan markerad vunnen) är ok — fortsätt och synka resten.
    if (wdErr && !/duplicate|unique/i.test(wdErr.message ?? "")) throw wdErr;

    // Synka auktionsfälten så handlarportalen ("Vunna", "Mina bud") ser vinsten.
    const { error: syncErr } = await supabaseAdmin
      .from("leads")
      .update({
        winning_dealer_id: data.dealer_id,
        auction_ended_at: (lead as any).auction_ended_at ?? new Date().toISOString(),
      } as never)
      .eq("id", data.leadId);
    if (syncErr) throw new Error(syncErr.message);

    // Stegbyte via motorn (admin-override: vunnen kan nås från säljarens
    // "gör upp direkt"-flöden) — loggar stage_transitions + timeline och
    // avbryter köade uppföljnings-SMS.
    const tr = await attemptStageTransition(
      data.leadId,
      "vunnen",
      "manual",
      userId,
      `Markerad som vunnen (${data.final_price.toLocaleString("sv-SE")} kr)`,
      { dealer_id: data.dealer_id, final_price: data.final_price },
      true,
    );
    if (!tr.success) throw new Error(tr.error ?? "Kunde inte sätta stage vunnen");

    // Trigger billing (idempotent — unikt index + befintlighetskontroll)
    await recordWonDealBilling(data.leadId, data.dealer_id, data.final_price);

    await supabaseAdmin.from("activity_timeline").insert({
      lead_id: data.leadId,
      type: "lead_won",
      description: `Vunnen för ${data.final_price.toLocaleString("sv-SE")} kr`,
      actor_id: userId,
      actor_type: "seller",
      metadata: { dealer_id: data.dealer_id, final_price: data.final_price } as never,
    });

    // Notifiera handlaren (best-effort).
    try {
      const { notifyDealerWon } = await import("@/lib/dealer-notifications.server");
      await notifyDealerWon({
        dealerId: data.dealer_id,
        leadId: data.leadId,
        finalPrice: data.final_price,
      });
    } catch (e) {
      console.error("notifyDealerWon failed:", e);
    }

    return { ok: true };
  });
