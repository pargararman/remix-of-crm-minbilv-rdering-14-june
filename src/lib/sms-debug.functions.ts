// Server-functions för /admin/sms-debug — diagnostik av SMS-flöden.
import { createServerFn } from "@tanstack/react-start";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("profiles").select("role").eq("id", userId).single();
  if ((data as any)?.role !== "admin") throw new Error("Forbidden: admin krävs");
}

export const getSmsDebugStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const webhookBase =
      process.env.TWILIO_WEBHOOK_BASE_URL ?? "https://app.minbilvardering.se";
    const inboundUrl = `${webhookBase.replace(/\/$/, "")}/api/public/twilio/inbound`;
    const statusUrl = `${webhookBase.replace(/\/$/, "")}/api/public/twilio/status`;

    const env = {
      hasAccountSid: Boolean(process.env.TWILIO_ACCOUNT_SID),
      hasAuthToken: Boolean(process.env.TWILIO_AUTH_TOKEN),
      hasFromNumber: Boolean(process.env.TWILIO_PHONE_NUMBER),
      fromNumber: process.env.TWILIO_PHONE_NUMBER ?? null,
      webhookBase,
      testMode: process.env.SMS_TEST_MODE === "true",
    };

    const [
      { data: recent },
      { data: queued },
      { data: failed },
      { data: orphans },
      { data: signatureFails },
      { count: inboundCount },
      { count: outboundCount },
    ] = await Promise.all([
      supabaseAdmin
        .from("messages")
        .select("id, lead_id, direction, body, from_phone, to_phone, delivery_status, delivery_error, twilio_message_sid, created_at")
        .order("created_at", { ascending: false })
        .limit(30),
      supabaseAdmin
        .from("messages")
        .select("id, lead_id, body, to_phone, created_at, send_at")
        .eq("direction", "outbound")
        .eq("delivery_status", "queued")
        .order("created_at", { ascending: false })
        .limit(20),
      supabaseAdmin
        .from("messages")
        .select("id, lead_id, body, to_phone, delivery_status, delivery_error, created_at")
        .eq("direction", "outbound")
        .in("delivery_status", ["failed", "undelivered"])
        .order("created_at", { ascending: false })
        .limit(20),
      supabaseAdmin
        .from("inbound_orphan_messages")
        .select("id, from_phone, body, received_at, ignored, assigned_to_lead_id")
        .order("received_at", { ascending: false })
        .limit(20),
      supabaseAdmin
        .from("audit_logs")
        .select("action, new_value, created_at")
        .eq("action", "twilio_inbound_invalid_signature")
        .order("created_at", { ascending: false })
        .limit(10),
      supabaseAdmin
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("direction", "inbound"),
      supabaseAdmin
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("direction", "outbound"),
    ]);

    return {
      env,
      urls: { inbound: inboundUrl, status: statusUrl },
      counts: {
        inboundTotal: inboundCount ?? 0,
        outboundTotal: outboundCount ?? 0,
        queued: queued?.length ?? 0,
        failed: failed?.length ?? 0,
        orphans: orphans?.length ?? 0,
        signatureFails: signatureFails?.length ?? 0,
      },
      recent: recent ?? [],
      queued: queued ?? [],
      failed: failed ?? [],
      orphans: orphans ?? [],
      signatureFails: signatureFails ?? [],
    };
  });

// Skickar ett signerat fake-inbound POST till webhook-endpointen — verifierar
// att Twilio→server-pipeline fungerar utan att Twilio behöver anropa oss.
export const sendTestInboundPing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        from: z.string().min(4).max(20).default("+46700000000"),
        body: z.string().min(1).max(160).default("TEST PING från sms-debug"),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!token) throw new Error("TWILIO_AUTH_TOKEN saknas i miljön");
    const base = process.env.TWILIO_WEBHOOK_BASE_URL ?? "https://app.minbilvardering.se";
    const fullUrl = `${base.replace(/\/$/, "")}/api/public/twilio/inbound`;

    const sid = `SMTEST${Date.now().toString(36).toUpperCase()}`;
    const params: Record<string, string> = {
      From: data.from,
      To: process.env.TWILIO_PHONE_NUMBER ?? "+46000000000",
      Body: data.body,
      MessageSid: sid,
      AccountSid: process.env.TWILIO_ACCOUNT_SID ?? "ACtest",
    };

    // Twilio-signatur: HMAC-SHA1(base64) över URL + sorterade key+value
    const sortedKeys = Object.keys(params).sort();
    let signData = fullUrl;
    for (const k of sortedKeys) signData += k + params[k];
    const signature = createHmac("sha1", token).update(signData).digest("base64");

    const form = new URLSearchParams(params).toString();
    const res = await fetch(fullUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Twilio-Signature": signature,
      },
      body: form,
    });
    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      url: fullUrl,
      sid,
      response: text.slice(0, 500),
    };
  });

// Probar webhook-URL utan signatur — visar om Twilio över huvud taget når oss
// (förväntat svar: 403 text/plain). Om svaret är 3xx följer Twilio inte redirect.
export const probeTwilioWebhookReachability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const base = process.env.TWILIO_WEBHOOK_BASE_URL ?? "https://app.minbilvardering.se";
    const urls = [
      `${base.replace(/\/$/, "")}/api/public/twilio/inbound`,
      `${base.replace(/\/$/, "")}/api/public/twilio/status`,
    ];

    const results = await Promise.all(
      urls.map(async (url) => {
        try {
          const res = await fetch(url, {
            method: "POST",
            redirect: "manual",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: "probe=1",
          });
          const contentType = res.headers.get("content-type") ?? "";
          const location = res.headers.get("location");
          const isRedirect = res.status >= 300 && res.status < 400;
          const looksLikeHtml = contentType.includes("text/html");
          const bodyPreview = (await res.text()).slice(0, 200);
          // Tolkning: ett 403 från vår handler är "OK – webhook nås".
          // 3xx eller HTML = trasig routing (oftast 302 till custom domain).
          const reachable = !isRedirect && !looksLikeHtml;
          return {
            url,
            status: res.status,
            contentType,
            location,
            isRedirect,
            looksLikeHtml,
            reachable,
            bodyPreview,
          };
        } catch (e: any) {
          return {
            url,
            status: 0,
            contentType: "",
            location: null,
            isRedirect: false,
            looksLikeHtml: false,
            reachable: false,
            bodyPreview: e?.message ?? "fetch misslyckades",
          };
        }
      }),
    );

    return { results };
  });

