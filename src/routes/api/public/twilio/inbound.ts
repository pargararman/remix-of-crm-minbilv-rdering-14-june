// Twilio inbound SMS-webhook.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { validateTwilioSignature } from "@/lib/sms/twilio.server";
import { normalizePhoneE164 } from "@/lib/format";
import { applyStageRule } from "@/lib/automation/stage-rules.server";
import { cancelScheduledFollowups } from "@/lib/automation/schedule-followups.server";

const TWIML_EMPTY = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

function twiml(body: string = TWIML_EMPTY, status = 200) {
  return new Response(body, { status, headers: { "Content-Type": "text/xml" } });
}

export const Route = createFileRoute("/api/public/twilio/inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env.TWILIO_AUTH_TOKEN;
        if (!token) {
          console.error("[twilio/inbound] TWILIO_AUTH_TOKEN saknas");
          return new Response("Server saknar konfig", { status: 500 });
        }

        const raw = await request.text();
        const params = Object.fromEntries(new URLSearchParams(raw).entries()) as Record<string, string>;
        const signature = request.headers.get("X-Twilio-Signature");

        // Twilio signerar EXAKT den URL den POSTade till. Bygg kandidat-URL:er
        // (request.url, origin, env-base, kanonisk domän) och godkänn om någon
        // matchar — tål proxy/host-skillnader utan att försvaga säkerheten.
        const reqUrl = request.url;
        const reqOrigin = new URL(reqUrl).origin;
        const envBase = process.env.TWILIO_WEBHOOK_BASE_URL?.replace(/\/$/, "");
        const candidates = Array.from(
          new Set(
            [
              reqUrl,
              reqUrl.split("?")[0],
              `${reqOrigin}/api/public/twilio/inbound`,
              envBase ? `${envBase}/api/public/twilio/inbound` : null,
              "https://app.minbilvardering.se/api/public/twilio/inbound",
            ].filter(Boolean) as string[],
          ),
        );

        console.log("[twilio/inbound] POST", {
          reqUrl,
          reqOrigin,
          envBase,
          candidates,
          hasSignature: Boolean(signature),
          from: params.From,
          to: params.To,
          messageSid: params.MessageSid,
          bodyLen: (params.Body ?? "").length,
        });

        const matchedUrl = candidates.find((u) =>
          validateTwilioSignature(token, signature, u, params),
        );

        if (!matchedUrl) {
          console.warn("[twilio/inbound] signature invalid", {
            reqUrl,
            candidates,
            from: params.From,
            sid: params.MessageSid,
          });
          await supabaseAdmin.from("audit_logs").insert({
            action: "twilio_inbound_invalid_signature",
            object_type: "webhook",
            new_value: {
              from: params.From ?? null,
              sid: params.MessageSid ?? null,
              req_url: reqUrl,
              candidates,
            },
          });
          return new Response("Forbidden", { status: 403 });
        }

        const sid = params.MessageSid;
        const from = params.From;
        const body = params.Body ?? "";
        if (!sid || !from) return twiml();

        // Idempotens
        const [{ data: existingMsg }, { data: existingOrphan }] = await Promise.all([
          supabaseAdmin.from("messages").select("id").eq("twilio_message_sid", sid).maybeSingle(),
          supabaseAdmin.from("inbound_orphan_messages").select("id").eq("twilio_message_sid", sid).maybeSingle(),
        ]);
        if (existingMsg || existingOrphan) return twiml();

        const fromE164 = normalizePhoneE164(from) ?? from;

        const { data: lead } = await supabaseAdmin
          .from("leads")
          .select("id, owner_id, customer_name")
          .eq("phone", fromE164)
          .neq("stage", "arkiverad")
          .order("last_activity_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lead) {
          await supabaseAdmin.from("messages").insert({
            lead_id: lead.id,
            direction: "inbound",
            from_phone: fromE164,
            to_phone: params.To ?? process.env.TWILIO_PHONE_NUMBER ?? null,
            body,
            twilio_message_sid: sid,
            delivery_status: "received",
          });
          await supabaseAdmin
            .from("leads")
            .update({ last_activity_at: new Date().toISOString() })
            .eq("id", lead.id);
          await supabaseAdmin.from("activity_timeline").insert({
            lead_id: lead.id,
            type: "sms_received",
            description: `SMS från kund: ${body.slice(0, 80)}${body.length > 80 ? "…" : ""}`,
            actor_type: "system",
          });
          if (lead.owner_id) {
            await supabaseAdmin.from("notifications").insert({
              user_id: lead.owner_id,
              lead_id: lead.id,
              type: "sms_received",
              title: `Nytt SMS från ${lead.customer_name ?? "kund"}`,
              body: body.slice(0, 140),
            });
          }
          // Auto-stage + cancel köade followups (kund har svarat)
          try {
            await applyStageRule(lead.id, { kind: "sms_inbound" });
            await cancelScheduledFollowups(lead.id, "customer_replied");
          } catch (e) {
            console.error("post-inbound automation failed:", e);
          }
        } else {
          const { data: orphan } = await supabaseAdmin
            .from("inbound_orphan_messages")
            .insert({
              twilio_message_sid: sid,
              from_phone: fromE164,
              body,
            })
            .select("id")
            .single();
          // Notifiera alla admins
          const { data: admins } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("role", "admin");
          if (admins?.length && orphan) {
            await supabaseAdmin.from("notifications").insert(
              admins.map((a) => ({
                user_id: a.id,
                type: "orphan_sms",
                title: `Inkommande SMS från okänt nummer ${fromE164}`,
                body: body.slice(0, 140),
              })),
            );
          }
        }

        return twiml();
      },
    },
  },
});
