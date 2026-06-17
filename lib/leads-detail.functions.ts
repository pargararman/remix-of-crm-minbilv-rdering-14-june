// Server fn: lead-detalj med vehicle + pricing + ägare + olästa-räknare per lead.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getLeadDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ leadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [{ data: lead, error: le }, { data: vehicle }, { data: pricing }, { data: settings }] =
      await Promise.all([
        supabase
          .from("leads")
          .select(
            "id, customer_name, phone, email, registration_number, stage, owner_id, source, lead_score, city, region, created_at, last_activity_at, free_text, archived_at, equipment_notes, extras_list, sell_timeframe, lost_reason_code, lost_reason_text, customer_expectation, selling_timeframe, submission_count, last_submission_at",
          )
          .eq("id", data.leadId)
          .maybeSingle(),
        supabase
          .from("vehicles")
          .select("brand, model, year, mileage_mil, fuel, gearbox, version, horsepower, body_type, service_book, tires, keys_count, condition, damage_notes, inspection_until, equipment_notes, image_urls, selling_timeframe, equipment_package, options")
          .eq("lead_id", data.leadId)
          .maybeSingle(),
        supabase
          .from("pricing")
          .select("valuation_from, valuation_to, customer_expectation, in_price, out_price, in_price_from, in_price_to, out_price_from, out_price_to")
          .eq("lead_id", data.leadId)
          .maybeSingle(),
        supabase
          .from("company_settings")
          .select("car_info_url_pattern, blocket_url_pattern, biluppgifter_url_pattern, sms_quiet_hours_start, sms_quiet_hours_end")
          .limit(1)
          .maybeSingle(),
      ]);
    if (le) throw le;
    if (!lead) throw new Error("Lead saknas");
    // Hämta ägare-namn separat (FK saknas i schemat).
    let ownerName: string | null = null;
    if ((lead as any).owner_id) {
      const { data: p } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", (lead as any).owner_id)
        .maybeSingle();
      ownerName = (p as any)?.name ?? null;
    }
    return { lead, vehicle, pricing, settings, ownerName };
  });

// Olästa inbound SMS per lead (för dashboard-badges).
export const getUnreadCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("messages")
      .select("lead_id")
      .eq("direction", "inbound")
      .is("read_at", null);
    if (error) throw error;
    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      const k = row.lead_id as string;
      counts[k] = (counts[k] ?? 0) + 1;
    }
    return counts;
  });

// Manuell stage-uppdatering. Validerar mot övergångsmatrisen via
// stegmotorn (som även loggar stage_transitions + timeline och avbryter
// obsoleta stage_jobs/uppföljnings-SMS). Admin får override.
export const updateLeadStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        leadId: z.string().uuid(),
        stage: z.enum([
          "ny_lead", "snabb_vardering", "kontaktad",
          "uppfoljning_1", "uppfoljning_2", "uppfoljning_3", "inget_svar",
          "matchad", "bud_mottaget", "kund_accepterat", "kontrakt_pagar_avtal",
          "hamtning", "vunnen", "forlorad", "arkiverad",
        ]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { attemptStageTransition } = await import("@/lib/automation/stage-rules.server");
    const { STAGE_LABELS } = await import("@/lib/stage-docs");

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId!)
      .maybeSingle();
    const isAdmin = (profile as any)?.role === "admin";

    const { data: prev } = await supabase
      .from("leads")
      .select("stage")
      .eq("id", data.leadId)
      .maybeSingle();
    const fromStage = (prev as any)?.stage ?? null;

    const result = await attemptStageTransition(
      data.leadId,
      data.stage,
      "manual",
      userId,
      "Manuellt stegbyte",
      {},
      isAdmin,
    );
    if (!result.success) {
      const fromLabel = fromStage ? ((STAGE_LABELS as any)[fromStage] ?? fromStage) : "?";
      const toLabel = (STAGE_LABELS as any)[data.stage] ?? data.stage;
      throw new Error(
        result.error ?? `Övergång ej tillåten: ${fromLabel} → ${toLabel}`,
      );
    }

    // Avarkivera vid flytt bort från arkivet (motorn sätter archived_at
    // endast vid arkivering).
    if (data.stage !== "arkiverad") {
      await supabase
        .from("leads")
        .update({ archived_at: null } as any)
        .eq("id", data.leadId);
    }

    await supabase.from("audit_logs").insert({
      user_id: userId,
      action: "lead_stage_changed_manual",
      object_type: "lead",
      object_id: data.leadId,
      old_value: { stage: fromStage } as never,
      new_value: { stage: data.stage } as never,
    } as never);

    // Notifiera vid Godkänt pris (matchad) — verifiering av värdering
    // innan publicering/budgivning. (Tidigare kopplad till det obefintliga
    // stage-värdet "godkanda_prisforslag" och skickades därför aldrig.)
    if (data.stage === "matchad") {
      try {
        const { sendEmail } = await import("@/lib/email/resend.server");
        const [{ data: leadRow }, { data: vehRow }] = await Promise.all([
          supabase
            .from("leads")
            .select("customer_name, phone, registration_number")
            .eq("id", data.leadId)
            .maybeSingle(),
          supabase
            .from("vehicles")
            .select("mileage_mil")
            .eq("lead_id", data.leadId)
            .maybeSingle(),
        ]);
        const namn = (leadRow as any)?.customer_name ?? null;
        const regnr = (leadRow as any)?.registration_number ?? "—";
        const tel = (leadRow as any)?.phone ?? "—";
        const mil = (vehRow as any)?.mileage_mil;
        const matar = mil != null ? `${Number(mil).toLocaleString("sv-SE")} mil` : null;
        const ident = namn ?? regnr;

        const lines = [
          `Leadet ${ident} har nått steget Godkänt pris (matchad).`,
          `Vänligen verifiera bilvärderingen innan affären går vidare.`,
          ``,
          `Regnummer: ${regnr}`,
          `Namn: ${namn ?? "—"}`,
          `Telefon: ${tel}`,
          ...(matar ? [`Mätarställning: ${matar}`] : []),
          ``,
          `Värderingen måste bekräftas innan affären kan fortsätta.`,
        ];
        const text = lines.join("\n");
        const html = `<p>${lines
          .map((l) => (l === "" ? "</p><p>" : l.replace(/</g, "&lt;")))
          .join("<br/>")}</p>`;

        await sendEmail({
          to: "info@minbilvardering.se",
          subject: `Verifiera värdering – ${regnr} (Godkänt pris)`,
          text,
          html,
        });
      } catch (e) {
        console.error("Failed to send Godkända Prisförslag email", e);
      }
    }

    return { ok: true };
  });

// Lista alla aktiva säljare för owner-dropdown.
export const listActiveSellers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("id, name, role, status")
      .in("role", ["seller", "admin"])
      .eq("status", "active")
      .order("name");
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{ id: string; name: string | null; role: string; status: string }>;
  });

// Ta ansvar för en otilldelad lead (atomiskt).
export const claimLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ leadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const now = new Date().toISOString();
    const { data: updated, error } = await supabase
      .from("leads")
      .update({ owner_id: userId, owned_at: now } as any)
      .eq("id", data.leadId)
      .is("owner_id", null)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) {
      // Redan tagen — läs ägare för meddelande.
      const { data: cur } = await supabase
        .from("leads")
        .select("owner_id")
        .eq("id", data.leadId)
        .maybeSingle();
      const ownerId = (cur as any)?.owner_id;
      let name = "någon annan";
      if (ownerId) {
        const { data: p } = await supabase.from("profiles").select("name").eq("id", ownerId).maybeSingle();
        name = (p as any)?.name ?? "någon annan";
      }
      throw new Error(`Lead är redan tagen av ${name}`);
    }
    await supabase.from("activity_timeline").insert({
      lead_id: data.leadId,
      type: "lead_claimed",
      description: "Lead övertagen",
      actor_id: userId,
      actor_type: "seller",
    } as never);
    await supabase.from("audit_logs").insert({
      user_id: userId,
      action: "lead_claimed",
      object_type: "lead",
      object_id: data.leadId,
      new_value: { owner_id: userId } as never,
    } as never);
    return { ok: true };
  });

// Byt ägare på en lead (alla säljare får).
export const reassignLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ leadId: z.string().uuid(), newOwnerId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: prev } = await supabase
      .from("leads")
      .select("owner_id")
      .eq("id", data.leadId)
      .maybeSingle();
    const oldId = (prev as any)?.owner_id ?? null;
    const { error } = await supabase
      .from("leads")
      .update({ owner_id: data.newOwnerId, owned_at: new Date().toISOString() } as any)
      .eq("id", data.leadId);
    if (error) throw new Error(error.message);

    const [oldP, newP] = await Promise.all([
      oldId
        ? supabase.from("profiles").select("name").eq("id", oldId).maybeSingle()
        : Promise.resolve({ data: null } as any),
      supabase.from("profiles").select("name").eq("id", data.newOwnerId).maybeSingle(),
    ]);
    const oldName = (oldP as any)?.data?.name ?? "ingen";
    const newName = (newP as any)?.data?.name ?? "okänd";
    await supabase.from("activity_timeline").insert({
      lead_id: data.leadId,
      type: "lead_reassigned",
      description: `Ansvarig ändrad från ${oldName} till ${newName}`,
      actor_id: userId,
      actor_type: "seller",
      metadata: { from_owner: oldId, to_owner: data.newOwnerId } as never,
    } as never);
    await supabase.from("audit_logs").insert({
      user_id: userId,
      action: "lead_reassigned",
      object_type: "lead",
      object_id: data.leadId,
      old_value: { owner_id: oldId } as never,
      new_value: { owner_id: data.newOwnerId } as never,
    } as never);
    return { ok: true };
  });

// ============ Active deal checklist ============

const ChecklistFields = z.object({
  bud_mottaget: z.boolean(),
  kund_kontaktad: z.boolean(),
  bud_accepterat: z.boolean(),
  hamtning_bokad: z.boolean(),
  hamtning_genomford: z.boolean(),
});

export const getActiveDealChecklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ leadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("lead_active_deal_checklist" as any)
      .select("*")
      .eq("lead_id", data.leadId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (row as any) ?? {
      lead_id: data.leadId,
      bud_mottaget: false,
      kund_kontaktad: false,
      bud_accepterat: false,
      hamtning_bokad: false,
      hamtning_genomford: false,
    };
  });

export const saveActiveDealChecklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ leadId: z.string().uuid(), values: ChecklistFields }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Hämta tidigare värden för audit-diff.
    const { data: prev } = await supabase
      .from("lead_active_deal_checklist" as any)
      .select("*")
      .eq("lead_id", data.leadId)
      .maybeSingle();

    const row = {
      lead_id: data.leadId,
      ...data.values,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from("lead_active_deal_checklist" as any)
      .upsert(row as any, { onConflict: "lead_id" });
    if (error) throw new Error(error.message);

    const done = Object.values(data.values).filter(Boolean).length;
    await supabase.from("activity_timeline").insert({
      lead_id: data.leadId,
      type: "checklist_updated",
      description: `Affärschecklista uppdaterad: ${done}/5`,
      actor_id: userId,
      actor_type: "seller",
      metadata: data.values as never,
    } as never);

    // Audit log (via admin för att kringgå RLS på audit_logs).
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("audit_logs").insert({
        user_id: userId,
        action: "active_deal_checklist_updated",
        object_type: "lead",
        object_id: data.leadId,
        old_value: (prev as any) ?? null,
        new_value: data.values as any,
      } as never);
    } catch {
      /* audit best-effort */
    }

    return { ok: true };
  });
