// PATCH /api/public/leads/$leadId — uppdatera befintlig lead inkrementellt
// från minbilvardering.se. HMAC-SHA256 signaturkontroll, samma payload-schema
// som intake.ts men alla fält är valfria. Skriver aldrig över befintliga
// värden med null. Extras-fält (utrustning, tillval, säljtid, övrigt) sparas
// som en intern note.
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CORS_HEADERS, jsonResponse } from "@/lib/cors";
import { normalizePhoneE164, normalizeRegnr, parseMileageRange } from "@/lib/format";

const patchSchema = z.object({
  step: z.enum(["valuation", "extras", "regnummer"]).optional(),
  regnummer: z.string().min(2).max(10).optional(),
  matarstallning: z.string().max(50).optional(),
  namn: z.string().trim().max(100).optional(),
  email: z.string().trim().email().max(255).optional(),
  telefon: z.string().trim().max(30).optional(),
  utrustningspaket: z.string().max(200).nullable().optional(),
  tillval: z.array(z.string().max(100)).max(50).optional(),
  saljtid: z.string().max(100).nullable().optional(),
  ovrig_info: z.string().max(2000).nullable().optional(),
  gdpr_consent: z.boolean().optional(),
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function verifySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  try {
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    const a = Buffer.from(expected, "hex");
    const sigClean = signature.replace(/^sha256=/, "");
    const b = Buffer.from(sigClean, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

async function logAttempt(row: Record<string, unknown>) {
  try {
    await supabaseAdmin.from("intake_attempts").insert(row as never);
  } catch (e) {
    console.error("intake_attempts log failed:", e);
  }
}

function isPlaceholderEmail(email: string | null | undefined): boolean {
  return !!email && email.startsWith("pending+") && email.endsWith("@minbilvardering.se");
}

export const Route = createFileRoute("/api/public/leads/$leadId")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),

      PATCH: async ({ request, params }) => {
        const secret = process.env.INTAKE_WEBHOOK_SECRET;
        if (!secret) {
          await logAttempt({
            status: "server_error",
            error_message: "INTAKE_WEBHOOK_SECRET saknas",
          });
          return jsonResponse({ error: "Server saknar konfiguration" }, 500);
        }

        const leadId = params.leadId;
        if (!UUID_RE.test(leadId)) {
          return jsonResponse({ error: "Ogiltigt lead-id" }, 400);
        }

        const rawBody = await request.text();
        const signature =
          request.headers.get("x-webhook-signature") ?? request.headers.get("x-signature");

        if (!verifySignature(rawBody, signature, secret)) {
          await logAttempt({
            status: "signature_failed",
            signature_valid: false,
            error_message: "Ogiltig webhook-signatur (patch)",
            raw_payload_preview: rawBody.slice(0, 1000),
          });
          return jsonResponse({ error: "Ogiltig signatur" }, 401);
        }

        let parsed: z.infer<typeof patchSchema>;
        try {
          parsed = patchSchema.parse(JSON.parse(rawBody));
        } catch (e) {
          const issues = e instanceof z.ZodError ? e.issues : null;
          await logAttempt({
            status: "validation_failed",
            signature_valid: true,
            error_message: e instanceof Error ? e.message : String(e),
            validation_errors: issues,
            raw_payload_preview: rawBody.slice(0, 1000),
            created_lead_id: leadId,
          });
          return jsonResponse(
            { error: "Felaktigt format", details: e instanceof Error ? e.message : String(e) },
            400,
          );
        }

        const { data: lead } = await supabaseAdmin
          .from("leads")
          .select("id, email, free_text, archived_at")
          .eq("id", leadId)
          .maybeSingle();

        if (!lead || lead.archived_at) {
          await logAttempt({
            status: "not_found",
            signature_valid: true,
            source: "minbilvardering",
            created_lead_id: leadId,
            error_message: "Lead saknas eller arkiverad",
            payload_preview: { step: parsed.step },
          });
          return jsonResponse({ error: "Lead saknas" }, 404);
        }

        const update: Record<string, unknown> = {};
        const changed: string[] = [];

        if (parsed.namn && parsed.namn.trim()) {
          update.customer_name = parsed.namn.trim();
          changed.push("customer_name");
        }
        if (parsed.email && !isPlaceholderEmail(parsed.email)) {
          // Skriv över placeholder eller uppdatera om webben skickar nytt
          update.email = parsed.email;
          changed.push("email");
        }
        if (parsed.telefon) {
          const e164 = normalizePhoneE164(parsed.telefon);
          if (e164) {
            update.phone = e164;
            changed.push("phone");
          }
        }
        if (parsed.regnummer) {
          update.registration_number = normalizeRegnr(parsed.regnummer);
          changed.push("registration_number");
        }
        if (parsed.gdpr_consent === true) {
          update.gdpr_consent = true;
          update.consent_timestamp = new Date().toISOString();
          changed.push("gdpr_consent");
        }
        if (parsed.ovrig_info && parsed.ovrig_info.trim() && !lead.free_text) {
          update.free_text = parsed.ovrig_info.trim();
          changed.push("free_text");
        }
        if (parsed.utrustningspaket && parsed.utrustningspaket.trim()) {
          update.equipment_notes = parsed.utrustningspaket.trim();
          changed.push("equipment_notes");
        }
        if (parsed.tillval && parsed.tillval.length > 0) {
          update.extras_list = parsed.tillval;
          changed.push("extras_list");
        }
        if (parsed.saljtid && parsed.saljtid.trim()) {
          update.sell_timeframe = parsed.saljtid.trim();
          changed.push("sell_timeframe");
        }

        if (Object.keys(update).length > 0) {
          const { error: upErr } = await supabaseAdmin
            .from("leads")
            .update(update as never)
            .eq("id", leadId);
          if (upErr) {
            console.error("Lead update failed:", upErr);
            await logAttempt({
              status: "server_error",
              signature_valid: true,
              created_lead_id: leadId,
              error_message: upErr.message,
              payload_preview: { step: parsed.step, changed },
            });
            return jsonResponse({ error: "Kunde inte uppdatera lead" }, 500);
          }
        }

        // Vehicles: mätarställning
        if (parsed.matarstallning) {
          const mil = parseMileageRange(parsed.matarstallning);
          if (mil != null) {
            const { data: existingVehicle } = await supabaseAdmin
              .from("vehicles")
              .select("lead_id")
              .eq("lead_id", leadId)
              .maybeSingle();
            if (existingVehicle) {
              await supabaseAdmin
                .from("vehicles")
                .update({ mileage_mil: mil } as never)
                .eq("lead_id", leadId);
            } else {
              await supabaseAdmin
                .from("vehicles")
                .insert({ lead_id: leadId, mileage_mil: mil });
            }
            changed.push("mileage_mil");
          }
        }

        // Övrig info som anlände efter att free_text redan satts → spara som note
        if (parsed.ovrig_info && parsed.ovrig_info.trim() && lead.free_text) {
          await supabaseAdmin.from("notes").insert({
            lead_id: leadId,
            content: `Övrigt: ${parsed.ovrig_info.trim()}`,
            visibility: "internal",
          });
          changed.push("notes");
        }

        await supabaseAdmin.from("activity_timeline").insert({
          lead_id: leadId,
          type: "lead_updated_via_intake",
          description: `Lead uppdaterad via webbformulär (${changed.join(", ") || "ingen ändring"})`,
          actor_type: "system",
          metadata: { source: "minbilvardering.se", step: parsed.step ?? null, changed },
        });

        await supabaseAdmin.from("audit_logs").insert({
          action: "lead_updated_via_intake",
          object_type: "lead",
          object_id: leadId,
          new_value: { step: parsed.step ?? null, changed, update: update as never },
        });

        await logAttempt({
          status: "updated",
          signature_valid: true,
          source: "minbilvardering",
          created_lead_id: leadId,
          registration_number: (update.registration_number as string) ?? null,
          phone: (update.phone as string) ?? null,
          email: (update.email as string) ?? null,
          payload_preview: { step: parsed.step ?? null, changed },
        });

        return jsonResponse({ ok: true, lead_id: leadId, updated: true });
      },
    },
  },
});
