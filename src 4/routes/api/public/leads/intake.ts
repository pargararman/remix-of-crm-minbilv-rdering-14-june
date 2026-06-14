// Lead intake-webhook för minbilvardering.se
// Stegbaserad: step=regnummer skapar lead, step=valuation/extras merger in mot
// befintlig lead på regnr. Signatur via HMAC-SHA256 + constant-time compare.
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CORS_HEADERS, jsonResponse } from "@/lib/cors";
import { normalizePhoneE164, normalizeRegnr, parseMileageRange } from "@/lib/format";
import { sendSms } from "@/lib/sms/send.server";
import { notifySellersNewLead, notifySellersRepeatLead } from "@/lib/sms/notify-sellers.server";
import { sendIntakeEmail } from "@/lib/email/intake-email.server";
import { sendInternalLeadBackupEmail } from "@/lib/email/internal-backup.server";
import { scheduleFollowups } from "@/lib/automation/schedule-followups.server";
import { geocodeLeadInBackground } from "@/lib/geocoding.server";

type AutoTask = { label: string; kind: "sms" | "email" | "other"; templateCode?: string };

async function reportAutoTaskFailures(
  leadId: string,
  tasks: AutoTask[],
  results: PromiseSettledResult<unknown>[],
): Promise<void> {
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status !== "rejected") continue;
    const t = tasks[i] ?? { label: `task_${i}`, kind: "other" as const };
    const reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
    console.error("[intake] auto task failed", {
      lead_id: leadId,
      task: t.label,
      templateCode: t.templateCode,
      reason,
    });
    const timelineType =
      t.kind === "sms" ? "sms_failed" : t.kind === "email" ? "email_failed" : null;
    if (timelineType) {
      try {
        await supabaseAdmin.from("activity_timeline").insert({
          lead_id: leadId,
          type: timelineType,
          description: `Automatisk ${t.kind === "sms" ? "SMS" : "e-post"} (${t.label})${t.templateCode ? ` [${t.templateCode}]` : ""} misslyckades: ${reason}`,
          actor_type: "system",
          metadata: { task: t.label, templateCode: t.templateCode ?? null, reason },
        });
      } catch (e) {
        console.error("[intake] could not log failure timeline entry:", e);
      }
    }
  }
}

const payloadSchema = z.object({
  step: z.enum(["valuation", "extras", "regnummer"]),
  regnummer: z.string().min(2).max(10).optional(),
  matarstallning: z.string().max(50).optional(),
  namn: z.string().trim().max(100).optional(),
  email: z.string().trim().email().max(255).optional(),
  telefon: z.string().trim().max(30).optional(),

  // Existing extras-step fields
  utrustningspaket: z.string().max(200).nullable().optional(),
  tillval: z.array(z.string().max(100)).max(50).optional(),
  saljtid: z.string().max(100).nullable().optional(),
  ovrig_info: z.string().max(2000).nullable().optional(),
  gdpr_consent: z.boolean().optional(),

  // What the website edge function actually posts
  keys: z.string().max(50).nullable().optional(),
  tires: z.string().max(50).nullable().optional(),
  servicebook: z.string().max(50).nullable().optional(),
  condition: z.string().max(50).nullable().optional(),
  damages: z.string().max(2000).nullable().optional(),
  price_expectation: z.string().max(100).nullable().optional(),
  sell_time: z.string().max(100).nullable().optional(),
  comments: z.string().max(2000).nullable().optional(),
  images: z.array(z.string().max(500)).max(20).nullable().optional(),

  // Allow the edge function to pass an existing lead id on update calls
  lead_id: z.string().uuid().optional(),
});

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

type AttemptRow = {
  source?: string | null;
  external_id?: string | null;
  registration_number?: string | null;
  phone?: string | null;
  email?: string | null;
  status: string;
  error_message?: string | null;
  validation_errors?: unknown;
  signature_valid?: boolean | null;
  idempotency_key?: string | null;
  created_lead_id?: string | null;
  payload_preview?: Record<string, unknown> | null;
  raw_payload_preview?: string | null;
};

async function logAttempt(row: AttemptRow) {
  try {
    await supabaseAdmin.from("intake_attempts").insert(row as never);
  } catch (e) {
    console.error("intake_attempts log failed:", e);
  }
}

const PLACEHOLDER_EMAIL_PREFIX = "pending+";
function isPlaceholderEmail(email: string | null | undefined): boolean {
  return !!email && email.startsWith(PLACEHOLDER_EMAIL_PREFIX);
}

export const Route = createFileRoute("/api/public/leads/intake")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),

      POST: async ({ request }) => {
        const secret = process.env.INTAKE_WEBHOOK_SECRET;
        if (!secret) {
          console.error("INTAKE_WEBHOOK_SECRET saknas");
          await logAttempt({ status: "server_error", error_message: "INTAKE_WEBHOOK_SECRET saknas" });
          return jsonResponse({ error: "Server saknar konfiguration" }, 500);
        }

        const rawBody = await request.text();
        const signature = request.headers.get("x-webhook-signature") ?? request.headers.get("x-signature");
        const idemKey = request.headers.get("x-idempotency-key");

        if (!verifySignature(rawBody, signature, secret)) {
          await logAttempt({
            status: "signature_failed",
            signature_valid: false,
            idempotency_key: idemKey,
            error_message: "Ogiltig webhook-signatur",
            raw_payload_preview: rawBody.slice(0, 1000),
          });
          return jsonResponse({ error: "Ogiltig signatur" }, 401);
        }

        // Idempotency – obs: nyckeln bör vara unik per *steg*, inte per lead.
        if (idemKey) {
          const { data: existingIdem } = await supabaseAdmin
            .from("intake_idempotency")
            .select("lead_id")
            .eq("idempotency_key", idemKey)
            .maybeSingle();
          if (existingIdem) {
            await logAttempt({
              status: "duplicate_request",
              signature_valid: true,
              idempotency_key: idemKey,
              created_lead_id: existingIdem.lead_id,
            });
            return jsonResponse({ ok: true, lead_id: existingIdem.lead_id, deduped: true });
          }
        }

        let parsed: z.infer<typeof payloadSchema>;
        try {
          parsed = payloadSchema.parse(JSON.parse(rawBody));
        } catch (e) {
          const issues = e instanceof z.ZodError ? e.issues : null;
          await logAttempt({
            status: "validation_failed",
            signature_valid: true,
            idempotency_key: idemKey,
            error_message: e instanceof Error ? e.message : String(e),
            validation_errors: issues,
            raw_payload_preview: rawBody.slice(0, 1000),
          });
          return jsonResponse(
            { error: "Felaktigt format", details: e instanceof Error ? e.message : String(e) },
            400,
          );
        }

        console.log("[intake] parsed OK", {
          step: parsed.step,
          regnr: parsed.regnummer,
          lead_id: parsed.lead_id,
          has_keys: parsed.keys !== undefined,
          has_tires: parsed.tires !== undefined,
          has_servicebook: parsed.servicebook !== undefined,
          has_images: Array.isArray(parsed.images) ? parsed.images.length : 0,
          has_comments: !!parsed.comments,
          has_sell_time: !!parsed.sell_time,
        });

        const regnr = parsed.regnummer ? normalizeRegnr(parsed.regnummer) : null;
        const phoneE164 = parsed.telefon ? normalizePhoneE164(parsed.telefon) : null;
        if (parsed.telefon && !phoneE164) {
          await logAttempt({
            status: "validation_failed",
            signature_valid: true,
            source: "minbilvardering",
            registration_number: regnr,
            phone: parsed.telefon,
            email: parsed.email ?? null,
            error_message: "Ogiltigt telefonnummer",
            payload_preview: { step: parsed.step },
          });
          return jsonResponse({ error: "Ogiltigt telefonnummer" }, 400);
        }

        const previewBase = {
          step: parsed.step,
          regnr,
          phone: phoneE164,
          email: parsed.email,
          namn: parsed.namn,
        };

        // Slå upp befintlig lead: via lead_id om angivet, annars via regnr.
        let existing:
          | {
              id: string;
              email: string | null;
              customer_name: string | null;
              gdpr_consent: boolean | null;
              submission_count: number | null;
              stage: string | null;
            }
          | null = null;
        if (parsed.lead_id) {
          const { data } = await supabaseAdmin
            .from("leads")
            .select("id, email, customer_name, gdpr_consent, submission_count, stage")
            .eq("id", parsed.lead_id)
            .is("archived_at", null)
            .maybeSingle();
          existing = (data as any) ?? null;
        } else if (regnr) {
          const { data } = await supabaseAdmin
            .from("leads")
            .select("id, email, customer_name, gdpr_consent, submission_count, stage")
            .eq("registration_number", regnr)
            .is("archived_at", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          existing = (data as any) ?? null;
        }

        let leadId: string;
        let createdNew = false;
        let previousEmail: string | null = existing?.email ?? null;

        if (existing) {
          // Merge: uppdatera fält som faktiskt kommer i payloaden.
          leadId = existing.id;
          const leadUpdate: Record<string, unknown> = {};
          if (parsed.namn) leadUpdate.customer_name = parsed.namn;
          if (phoneE164) leadUpdate.phone = phoneE164;
          if (parsed.email) leadUpdate.email = parsed.email; // skriver över placeholder
          if (parsed.gdpr_consent !== undefined) {
            leadUpdate.gdpr_consent = parsed.gdpr_consent;
            if (parsed.gdpr_consent) leadUpdate.consent_timestamp = new Date().toISOString();
          }
          if (Object.keys(leadUpdate).length > 0) {
            const { error: upErr } = await supabaseAdmin
              .from("leads")
              .update(leadUpdate as never)
              .eq("id", leadId);
            if (upErr) {
              console.error("[intake] lead update failed", upErr);
              await logAttempt({
                status: "server_error",
                signature_valid: true,
                idempotency_key: idemKey,
                source: "minbilvardering",
                registration_number: regnr,
                phone: phoneE164,
                email: parsed.email ?? null,
                created_lead_id: leadId,
                error_message: upErr.message,
                payload_preview: previewBase,
              });
              return jsonResponse({ error: "Kunde inte uppdatera lead" }, 500);
            }
          }

          // Resubmission tracking — same regnr (or lead_id) seen again.
          const isFirstStepForResub = parsed.step === "regnummer";
          const nextSubmissionCount = (existing.submission_count ?? 1) + 1;
          if (isFirstStepForResub) {
            await supabaseAdmin
              .from("leads")
              .update({
                submission_count: nextSubmissionCount,
                last_submission_at: new Date().toISOString(),
              } as never)
              .eq("id", existing.id);
          }

          await supabaseAdmin.from("intake_submissions").insert({
            lead_id: existing.id,
            step: parsed.step,
            source: "minbilvardering",
            idempotency_key: idemKey,
            payload_preview: previewBase,
          } as never);

          await supabaseAdmin.from("activity_timeline").insert({
            lead_id: existing.id,
            type: isFirstStepForResub ? "lead_resubmitted" : "lead_resubmission_step",
            description: isFirstStepForResub
              ? `Återkomst — kund har lämnat förfrågan igen (gång #${nextSubmissionCount})`
              : `Återkomst — steg "${parsed.step}" ifyllt`,
            actor_type: "system",
            metadata: { step: parsed.step, source: "minbilvardering" },
          });

          try {
            const { data: existingTag } = await supabaseAdmin
              .from("lead_tags")
              .select("id")
              .eq("lead_id", existing.id)
              .eq("tag", "repeat_inquiry")
              .maybeSingle();
            if (!existingTag) {
              await supabaseAdmin
                .from("lead_tags")
                .insert({ lead_id: existing.id, tag: "repeat_inquiry" } as never);
            }
          } catch (e) {
            console.warn("[intake] could not add repeat_inquiry tag", e);
          }

          if (isFirstStepForResub) {
            void notifySellersRepeatLead({
              leadId: existing.id,
              regnummer: regnr,
              customerName: existing.customer_name ?? parsed.namn ?? null,
              currentStage: existing.stage ?? null,
              stageEnteredAt: null,
              submissionCount: nextSubmissionCount,
            });
          }
        } else {
          // Skapa: kräver regnr + telefon.
          if (!regnr) {
            await logAttempt({
              status: "missing_required_fields",
              signature_valid: true,
              source: "minbilvardering",
              error_message: "Saknar regnummer för ny lead",
              payload_preview: previewBase,
            });
            return jsonResponse({ error: "Saknar regnummer" }, 400);
          }
          if (!phoneE164) {
            await logAttempt({
              status: "missing_required_fields",
              signature_valid: true,
              source: "minbilvardering",
              registration_number: regnr,
              error_message: "Saknar telefon för ny lead",
              payload_preview: previewBase,
            });
            return jsonResponse({ error: "Saknar telefon" }, 400);
          }
          const fallbackEmail = `${PLACEHOLDER_EMAIL_PREFIX}${regnr.toLowerCase()}@minbilvardering.se`;
          const emailToUse = parsed.email ?? fallbackEmail;
          const { data: newLead, error: leadErr } = await supabaseAdmin
            .from("leads")
            .insert({
              customer_name: parsed.namn ?? null,
              phone: phoneE164,
              email: emailToUse,
              registration_number: regnr,
              source: "minbilvardering",
              stage: "ny_lead",
              gdpr_consent: parsed.gdpr_consent ?? false,
              consent_timestamp: parsed.gdpr_consent ? new Date().toISOString() : null,
              free_text: parsed.ovrig_info ?? null,
            })
            .select("id")
            .single();

          if (leadErr || !newLead) {
            console.error("Lead insert error:", leadErr);
            await logAttempt({
              status: "server_error",
              signature_valid: true,
              idempotency_key: idemKey,
              source: "minbilvardering",
              registration_number: regnr,
              phone: phoneE164,
              email: emailToUse,
              error_message: leadErr?.message ?? "Lead insert failed",
              payload_preview: previewBase,
            });
            return jsonResponse({ error: "Kunde inte skapa lead" }, 500);
          }
          leadId = newLead.id;
          createdNew = true;
          previousEmail = emailToUse;

          await supabaseAdmin.from("activity_timeline").insert({
            lead_id: leadId,
            type: "lead_created",
            description: `Lead skapad via webbformulär (minbilvardering.se, steg ${parsed.step})`,
            actor_type: "system",
            metadata: { source: "minbilvardering.se", step: parsed.step },
          });

          await supabaseAdmin.from("tasks").insert({
            lead_id: leadId,
            title: "Kontakta kund första gången",
            due_date: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          });

          await supabaseAdmin.from("audit_logs").insert({
            action: "lead_created_via_intake",
            object_type: "lead",
            object_id: leadId,
            new_value: { regnummer: regnr, source: "minbilvardering.se", step: parsed.step },
          });
        }

        // Upsert vehicles – merge alla bilrelaterade fält som steget tillhandahåller.
        const mileage = parseMileageRange(parsed.matarstallning);
        const vehiclePatch: Record<string, unknown> = { lead_id: leadId };
        if (mileage !== null && mileage !== undefined) vehiclePatch.mileage_mil = mileage;
        if (parsed.utrustningspaket !== undefined && parsed.utrustningspaket !== null) {
          vehiclePatch.equipment_package = parsed.utrustningspaket;
        }
        if (parsed.tillval && parsed.tillval.length > 0) vehiclePatch.options = parsed.tillval;
        if (parsed.saljtid !== undefined && parsed.saljtid !== null) {
          vehiclePatch.selling_timeframe = parsed.saljtid;
        }
        if (parsed.ovrig_info !== undefined && parsed.ovrig_info !== null) {
          vehiclePatch.notes = parsed.ovrig_info;
        }
        // Nya fält från webbens edge function
        if (parsed.keys !== undefined && parsed.keys !== null) vehiclePatch.keys_count = parsed.keys;
        if (parsed.tires !== undefined && parsed.tires !== null) vehiclePatch.tires = parsed.tires;
        if (parsed.servicebook !== undefined && parsed.servicebook !== null) {
          vehiclePatch.service_book = parsed.servicebook;
        }
        if (parsed.condition !== undefined && parsed.condition !== null) {
          vehiclePatch.condition = parsed.condition;
        }
        if (parsed.damages !== undefined && parsed.damages !== null) {
          vehiclePatch.damage_notes = parsed.damages;
        }
        const equipmentNotesValue = parsed.comments ?? parsed.ovrig_info;
        if (equipmentNotesValue !== undefined && equipmentNotesValue !== null) {
          vehiclePatch.equipment_notes = equipmentNotesValue;
        }
        if (parsed.images && parsed.images.length > 0) vehiclePatch.image_urls = parsed.images;
        if (Object.keys(vehiclePatch).length > 1) {
          const { error: vErr } = await supabaseAdmin
            .from("vehicles")
            .upsert(vehiclePatch as never, { onConflict: "lead_id" });
          if (vErr) console.error("[intake] vehicles upsert failed", vErr, vehiclePatch);
          else
            console.log(
              "[intake] vehicles upsert wrote",
              Object.keys(vehiclePatch).filter((k) => k !== "lead_id"),
            );
        }

        // Uppdatera lead med kundens prisförväntan och säljtid.
        const leadExtraUpdate: Record<string, unknown> = {};
        if (parsed.price_expectation !== undefined && parsed.price_expectation !== null) {
          leadExtraUpdate.customer_expectation = parsed.price_expectation;
        }
        if (parsed.sell_time !== undefined && parsed.sell_time !== null) {
          leadExtraUpdate.selling_timeframe = parsed.sell_time;
        }
        if (Object.keys(leadExtraUpdate).length > 0) {
          const { error: leErr } = await supabaseAdmin
            .from("leads")
            .update(leadExtraUpdate as never)
            .eq("id", leadId);
          if (leErr) console.error("[intake] lead extras update failed", leErr);
        }

        // Spegla även "extras"-fält till leads (bakåtkompatibilitet med UI:t).
        if (parsed.step === "extras") {
          const legacyUpdate: Record<string, unknown> = {};
          if (parsed.utrustningspaket?.trim()) legacyUpdate.equipment_notes = parsed.utrustningspaket.trim();
          if (parsed.tillval && parsed.tillval.length > 0) legacyUpdate.extras_list = parsed.tillval;
          if (parsed.saljtid?.trim()) legacyUpdate.sell_timeframe = parsed.saljtid.trim();
          if (parsed.ovrig_info?.trim() && existing && !existing.email)
            legacyUpdate.free_text = parsed.ovrig_info.trim();
          if (Object.keys(legacyUpdate).length > 0) {
            await supabaseAdmin.from("leads").update(legacyUpdate as never).eq("id", leadId);
          }
          if (parsed.ovrig_info?.trim() && existing) {
            await supabaseAdmin.from("notes").insert({
              lead_id: leadId,
              content: `Övrigt: ${parsed.ovrig_info.trim()}`,
              visibility: "internal",
            });
          }
        }

        if (idemKey) {
          await supabaseAdmin
            .from("intake_idempotency")
            .insert({ idempotency_key: idemKey, lead_id: leadId });
        }

        // Step-aware automation.
        // - Step 1 (regnummer / nyskapad lead): notifiera säljare + SMS till kund.
        // - Email till kund: när vi har riktig email OCH tidigare var placeholder
        //   (eller leaden är ny med riktig email).
        // - extras-steget: schemalägg uppföljningar + geokoda.
        const tasks: AutoTask[] = [];
        const promises: Promise<unknown>[] = [];

        if (createdNew) {
          // Hämta status_token för att kunna lägga till statusinlänk i SMS.
          const { data: freshLead } = await supabaseAdmin
            .from("leads")
            .select("status_token")
            .eq("id", leadId)
            .maybeSingle();
          const base = process.env.PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://app.minbilvardering.se";
          const statusUrl = freshLead?.status_token
            ? `${base}/status/${freshLead.status_token}`
            : null;

          tasks.push({ label: "sendSms", kind: "sms", templateCode: "intake_auto" });
          promises.push(
            sendSms({
              leadId,
              templateCode: "intake_auto",
              isSystem: true,
              appendText: statusUrl ? `Se status för din förfrågan: ${statusUrl}` : undefined,
            }),
          );
          tasks.push({ label: "notifySellersNewLead", kind: "other" });
          promises.push(notifySellersNewLead({ leadId, regnummer: regnr, customerName: parsed.namn ?? null }));
        }

        const hasRealEmail = !!parsed.email && !isPlaceholderEmail(parsed.email);
        const previousWasPlaceholder = isPlaceholderEmail(previousEmail) || previousEmail === null;
        const shouldSendIntakeEmail =
          hasRealEmail && (createdNew || previousWasPlaceholder || parsed.step === "extras");
        if (shouldSendIntakeEmail) {
          tasks.push({ label: "sendIntakeEmail", kind: "email" });
          promises.push(
            (async () => {
              await sendIntakeEmail(leadId);
              await supabaseAdmin.from("activity_timeline").insert({
                lead_id: leadId,
                type: "intake_email_sent",
                description: "Bekräftelsemail till kund skickat",
                actor_type: "system",
                metadata: { step: parsed.step },
              });
            })(),
          );
        }

        if (parsed.step === "extras" || parsed.step === "valuation") {
          tasks.push({ label: "sendInternalLeadBackupEmail", kind: "email" });
          promises.push(sendInternalLeadBackupEmail(leadId));
        }

        if (parsed.step === "extras") {
          tasks.push({ label: "scheduleFollowups", kind: "other" });
          promises.push(scheduleFollowups(leadId));
          tasks.push({ label: "geocodeLeadInBackground", kind: "other" });
          promises.push(geocodeLeadInBackground(leadId));
        }

        if (promises.length > 0) {
          const results = await Promise.allSettled(promises);
          await reportAutoTaskFailures(leadId, tasks, results);
        }

        await logAttempt({
          status: "success",
          signature_valid: true,
          idempotency_key: idemKey,
          source: "minbilvardering",
          registration_number: regnr,
          phone: phoneE164,
          email: parsed.email ?? null,
          created_lead_id: leadId,
          payload_preview: { ...previewBase, created: createdNew },
        });

        return jsonResponse(
          { ok: true, lead_id: leadId, created: createdNew, step: parsed.step },
          createdNew ? 201 : 200,
        );
      },
    },
  },
});
