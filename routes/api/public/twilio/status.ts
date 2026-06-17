// Twilio delivery-status webhook.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { validateTwilioSignature } from "@/lib/sms/twilio.server";
import type { Database } from "@/integrations/supabase/types";

type DeliveryStatus = Database["public"]["Enums"]["sms_delivery_status"];

function mapStatus(twilioStatus: string): DeliveryStatus {
  switch (twilioStatus) {
    case "queued":
    case "accepted":
    case "scheduled":
      return "queued";
    case "sending":
    case "sent":
      return "sent";
    case "delivered":
      return "delivered";
    case "undelivered":
      return "undelivered";
    case "failed":
      return "failed";
    default:
      return "sent";
  }
}

export const Route = createFileRoute("/api/public/twilio/status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env.TWILIO_AUTH_TOKEN;
        if (!token) {
          console.error("[twilio/status] TWILIO_AUTH_TOKEN saknas");
          return new Response("Server saknar konfig", { status: 500 });
        }

        const raw = await request.text();
        const params = Object.fromEntries(new URLSearchParams(raw).entries()) as Record<string, string>;
        const signature = request.headers.get("X-Twilio-Signature");

        const reqUrl = request.url;
        const reqOrigin = new URL(reqUrl).origin;
        const envBase = process.env.TWILIO_WEBHOOK_BASE_URL?.replace(/\/$/, "");
        const candidates = Array.from(
          new Set(
            [
              reqUrl,
              reqUrl.split("?")[0],
              `${reqOrigin}/api/public/twilio/status`,
              envBase ? `${envBase}/api/public/twilio/status` : null,
              "https://app.minbilvardering.se/api/public/twilio/status",
            ].filter(Boolean) as string[],
          ),
        );

        console.log("[twilio/status] POST", {
          reqUrl,
          candidates,
          hasSignature: Boolean(signature),
          messageSid: params.MessageSid,
          status: params.MessageStatus,
        });

        const matched = candidates.some((u) =>
          validateTwilioSignature(token, signature, u, params),
        );
        if (!matched) {
          console.warn("[twilio/status] signature invalid", { reqUrl, candidates, sid: params.MessageSid });
          await supabaseAdmin.from("audit_logs").insert({
            action: "twilio_status_invalid_signature",
            object_type: "webhook",
            new_value: { sid: params.MessageSid ?? null, req_url: reqUrl, candidates },
          });
          return new Response("Forbidden", { status: 403 });
        }

        const sid = params.MessageSid;
        const tStatus = params.MessageStatus;
        if (!sid || !tStatus) return new Response(null, { status: 200 });

        const status = mapStatus(tStatus);
        const errMsg = params.ErrorMessage ?? null;

        const { data: msg } = await supabaseAdmin
          .from("messages")
          .update({ delivery_status: status, delivery_error: errMsg })
          .eq("twilio_message_sid", sid)
          .select("id, lead_id, sender_id, body")
          .maybeSingle();

        if (msg && (status === "failed" || status === "undelivered")) {
          await supabaseAdmin.from("activity_timeline").insert({
            lead_id: msg.lead_id,
            type: "sms_failed",
            description: `SMS leverans misslyckades — ${errMsg ?? "okänt fel"}`,
            actor_type: "system",
          });
          if (msg.sender_id) {
            await supabaseAdmin.from("notifications").insert({
              user_id: msg.sender_id,
              lead_id: msg.lead_id,
              type: "sms_failed",
              title: "SMS leverans misslyckades",
              body: errMsg ?? "Okänt fel",
            });
          }
        }
        return new Response(null, { status: 200 });
      },
    },
  },
});
