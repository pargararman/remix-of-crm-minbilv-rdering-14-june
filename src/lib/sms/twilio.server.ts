// Twilio REST + signaturverifiering.
import { createHmac } from "node:crypto";

export interface TwilioSendResult {
  sid: string;
  status: string;
}

export async function sendViaTwilio(params: {
  from: string;
  to: string;
  body: string;
  statusCallback?: string;
}): Promise<TwilioSendResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("Twilio-konfiguration saknas");

  const form = new URLSearchParams({
    From: params.from,
    To: params.to,
    Body: params.body,
  });
  if (params.statusCallback) form.set("StatusCallback", params.statusCallback);

  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  const json = (await res.json()) as { sid?: string; status?: string; message?: string; code?: number };
  if (!res.ok) {
    throw new Error(`Twilio-fel ${res.status}: ${json.message ?? "okänt fel"} (kod ${json.code ?? "?"})`);
  }
  return { sid: json.sid ?? "", status: json.status ?? "queued" };
}

// Twilio signaturvalidering — HMAC-SHA1 (base64) över URL + sorterade params concat.
// https://www.twilio.com/docs/usage/webhooks/webhooks-security
export function validateTwilioSignature(
  authToken: string,
  signature: string | null,
  fullUrl: string,
  params: Record<string, string>,
): boolean {
  if (!signature) return false;
  const sorted = Object.keys(params).sort();
  let data = fullUrl;
  for (const k of sorted) data += k + params[k];
  const expected = createHmac("sha1", authToken).update(data).digest("base64");
  // Constant-time compare via length-equal Buffer compare
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}
