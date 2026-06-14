#!/usr/bin/env node
// Usage: node scripts-e2e-test.mjs +46739996552 pargar.arman@gmail.com ABC123 [url]
// Requires env INTAKE_WEBHOOK_SECRET to be set.
import { createHmac } from "node:crypto";

const [, , phone, email, regnr, urlArg] = process.argv;
if (!phone || !email || !regnr) {
  console.error("Usage: node scripts-e2e-test.mjs <phone E.164> <email> <regnr> [url]");
  process.exit(1);
}
const secret = process.env.INTAKE_WEBHOOK_SECRET;
if (!secret) {
  console.error("Missing INTAKE_WEBHOOK_SECRET env var");
  process.exit(1);
}
const baseUrl = urlArg || "https://app.minbilvardering.se";
const url = `${baseUrl}/api/public/leads/intake`;

async function post(payload) {
  const raw = JSON.stringify(payload);
  const sig = createHmac("sha256", secret).update(raw).digest("hex");
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-webhook-signature": `sha256=${sig}` },
    body: raw,
  });
  const text = await res.text();
  console.log(`[${res.status}]`, text);
  try { return JSON.parse(text); } catch { return null; }
}

console.log("→ step=valuation");
const v = await post({
  step: "valuation",
  regnummer: regnr,
  matarstallning: "8000-12000",
  namn: "E2E Testkund",
  email,
  telefon: phone,
  gdpr_consent: true,
});

console.log("→ step=extras");
await post({
  step: "extras",
  regnummer: regnr,
  email,
  telefon: phone,
  utrustningspaket: "Business",
  tillval: ["Drag", "Vinterhjul"],
  saljtid: "Inom 1 vecka",
  ovrig_info: "E2E test från script",
  gdpr_consent: true,
});

if (v?.leadId) {
  console.log(`\n✅ leadId: ${v.leadId}`);
  console.log(`Open: ${baseUrl}/leads/${v.leadId}`);
}
