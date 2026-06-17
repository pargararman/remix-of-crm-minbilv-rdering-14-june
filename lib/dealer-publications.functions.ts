// Publish lead to dealers + listing/removal.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireStaff } from "@/integrations/supabase/role-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { findMatchingDealers } from "@/lib/dealer-matching.server";
import { notifyDealerOfPublication } from "@/lib/dealer-notifications.server";
import { attemptStageTransition } from "@/lib/automation/stage-rules.server";
import { recordPerLeadBillingOnPublish } from "@/lib/billing-triggers.server";

async function assertLeadAccess(userId: string, leadId: string) {
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("id, owner_id")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) throw new Error("Lead saknas");
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  const isAdmin = (profile as any)?.role === "admin";
  if (!isAdmin && lead.owner_id && lead.owner_id !== userId) {
    throw new Error("Saknar åtkomst till denna lead");
  }
  return { lead, isAdmin };
}

export const publishLeadToDealers = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((input) =>
    z
      .object({
        leadId: z.string().uuid(),
        dealer_ids: z.array(z.string().uuid()).min(1).max(50),
        dealer_comment: z.string().max(4000).optional(),
        share_photos: z.boolean().default(true),
        share_city: z.boolean().default(true),
        include_pricing_range: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertLeadAccess(context.userId!, data.leadId);

    // Compute matches once for scores/reasons
    const matches = await findMatchingDealers(data.leadId);
    const matchMap = new Map(matches.map((m) => [m.dealer_id, m]));

    // Skilj på nya publiceringar och ompubliceringar — billing och
    // notifieringar ska bara gälla NYA (annars dubbeldebitering/spam).
    const { data: existingRows } = await supabaseAdmin
      .from("lead_dealer_publications")
      .select("dealer_id")
      .eq("lead_id", data.leadId)
      .in("dealer_id", data.dealer_ids);
    const existing = new Set((existingRows ?? []).map((r: any) => r.dealer_id));

    const created: any[] = [];
    const failed: string[] = [];
    for (const dealerId of data.dealer_ids) {
      const m = matchMap.get(dealerId);
      const { data: row, error } = await supabaseAdmin
        .from("lead_dealer_publications")
        .upsert(
          {
            lead_id: data.leadId,
            dealer_id: dealerId,
            published_by: context.userId,
            match_score: m?.match_score ?? null,
            match_reasons: m?.match_reasons ?? [],
            share_photos: data.share_photos,
            share_city: data.share_city,
            include_pricing_range: data.include_pricing_range,
            dealer_comment: data.dealer_comment ?? null,
          } as never,
          { onConflict: "lead_id,dealer_id" },
        )
        .select()
        .single();
      if (error) {
        console.error("publishLeadToDealers upsert failed:", dealerId, error.message);
        failed.push(dealerId);
        continue;
      }
      created.push(row);
    }
    const newlyCreated = created.filter((p) => !existing.has((p as any).dealer_id));

    // OBS: Tidigare skapades en dealer_visible-anteckning av kommentaren här.
    // Borttaget (fas 2): anteckningar med visibility=dealer_visible syns för
    // ALLA publicerade handlare, vilket läckte handlarspecifika kommentarer
    // till konkurrenter — och kommentaren visades dessutom dubbelt. Kommentaren
    // lagras redan per publikation (dealer_comment) och visas endast för rätt
    // handlare i portalen.

    // Attempt stage transition to matchad
    await attemptStageTransition(
      data.leadId,
      "matchad",
      "manual",
      context.userId,
      `Publicerad till ${created.length} handlare`,
    );

    // Record billing for per_lead dealers — ENDAST nya publiceringar
    // (ompublicering till samma handlare ska inte debiteras igen).
    try {
      await recordPerLeadBillingOnPublish(
        data.leadId,
        newlyCreated.map((p) => (p as any).dealer_id),
      );
    } catch (e) {
      console.error("recordPerLeadBillingOnPublish failed:", e);
    }

    // Notify each NEW publication (best-effort, sequential to respect SMS provider limits)
    for (const pub of newlyCreated) {
      try {
        await notifyDealerOfPublication({
          dealerId: (pub as any).dealer_id,
          leadId: data.leadId,
          publicationId: (pub as any).id,
        });
      } catch (e) {
        console.error("notifyDealerOfPublication failed:", e);
      }
    }

    // Timeline + audit
    const { data: dealers } = await supabaseAdmin
      .from("dealers")
      .select("id, company_name")
      .in(
        "id",
        created.map((p) => (p as any).dealer_id),
      );
    const names = (dealers ?? []).map((d: any) => d.company_name).join(", ");
    await supabaseAdmin.from("activity_timeline").insert({
      lead_id: data.leadId,
      type: "published_to_dealers",
      description: `Publicerad till ${created.length} handlare: ${names}`,
      actor_id: context.userId,
      actor_type: "seller",
      metadata: { dealer_ids: created.map((p) => (p as any).dealer_id) } as never,
    });
    await supabaseAdmin.from("audit_logs").insert({
      user_id: context.userId,
      action: "lead_published",
      object_type: "lead",
      object_id: data.leadId,
      new_value: { dealer_ids: created.map((p) => (p as any).dealer_id) } as never,
    } as never);

    return {
      publications: created,
      newCount: newlyCreated.length,
      republishedCount: created.length - newlyCreated.length,
      failedDealerIds: failed,
    };
  });

export const listLeadPublications = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((input) => z.object({ leadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertLeadAccess(context.userId!, data.leadId);
    const { data: rows, error } = await supabaseAdmin
      .from("lead_dealer_publications")
      .select(
        "*, dealer:dealers(id, company_name, city, region, status)",
      )
      .eq("lead_id", data.leadId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { publications: rows ?? [] };
  });

export const revokePublication = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((input) =>
    z.object({ publicationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: pub } = await supabaseAdmin
      .from("lead_dealer_publications")
      .select("id, lead_id, dealer_id")
      .eq("id", data.publicationId)
      .single();
    if (!pub) throw new Error("Publikation saknas");
    await assertLeadAccess(context.userId!, (pub as any).lead_id);
    const { error } = await supabaseAdmin
      .from("lead_dealer_publications")
      .delete()
      .eq("id", data.publicationId);
    if (error) throw error;
    await supabaseAdmin.from("activity_timeline").insert({
      lead_id: (pub as any).lead_id,
      type: "dealer_access_revoked",
      description: `Handlartillgång borttagen`,
      actor_id: context.userId,
      actor_type: "seller",
      metadata: { dealer_id: (pub as any).dealer_id } as never,
    });
    await supabaseAdmin.from("audit_logs").insert({
      user_id: context.userId,
      action: "dealer_publication_revoked",
      object_type: "lead_dealer_publication",
      object_id: data.publicationId,
    } as never);
    return { ok: true };
  });
