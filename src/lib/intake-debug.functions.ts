// Server-functions för admin-debug-sidan /admin/test/lead-intake.
import { createServerFn } from "@tanstack/react-start";
import { createHmac, randomUUID } from "node:crypto";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("profiles").select("role").eq("id", userId).single();
  if ((data as any)?.role !== "admin") throw new Error("Forbidden: admin krävs");
}

function getIntakeUrl(): string {
  // Stabil published URL för CRM.
  return "https://app.minbilvardering.se/api/public/leads/intake";
}

export const getIntakeDebugStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const url = getIntakeUrl();
    const secretPresent = Boolean(process.env.INTAKE_WEBHOOK_SECRET);

    const [{ data: lastSuccess }, { data: lastFail }] = await Promise.all([
      supabaseAdmin
        .from("intake_attempts")
        .select("created_at")
        .eq("status", "success")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("intake_attempts")
        .select("created_at,status,error_message")
        .neq("status", "success")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    return {
      intakeUrl: url,
      secretPresent,
      lastSuccessAt: (lastSuccess as any)?.created_at ?? null,
      lastFailureAt: (lastFail as any)?.created_at ?? null,
      lastFailureStatus: (lastFail as any)?.status ?? null,
      lastFailureMessage: (lastFail as any)?.error_message ?? null,
    };
  });

export const listIntakeAttempts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { limit?: number }) => input ?? {})
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const limit = Math.min(Math.max(data.limit ?? 20, 1), 100);
    const { data: rows, error } = await supabaseAdmin
      .from("intake_attempts")
      .select(
        "id,created_at,status,source,registration_number,phone,email,created_lead_id,signature_valid,error_message,payload_preview,validation_errors,idempotency_key,raw_payload_preview",
      )
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return { attempts: rows ?? [] };
  });

const testModeSchema = z.object({
  mode: z.enum(["valid", "duplicate", "idempotency", "invalid"]),
});

function randomRegnr(): string {
  const letters = "ABCDEFGHJKLMNPRSTUVWXYZ";
  const l = () => letters[Math.floor(Math.random() * letters.length)];
  const d = () => String(Math.floor(Math.random() * 10));
  return `${l()}${l()}${l()}${d()}${d()}${d()}`;
}

async function postSigned(body: unknown, idemKey: string) {
  const secret = process.env.INTAKE_WEBHOOK_SECRET;
  if (!secret) throw new Error("INTAKE_WEBHOOK_SECRET saknas");
  const raw = JSON.stringify(body);
  const sig = createHmac("sha256", secret).update(raw).digest("hex");
  const url = getIntakeUrl();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-webhook-signature": `sha256=${sig}`,
      "x-idempotency-key": idemKey,
    },
    body: raw,
  });
  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* keep text */
  }
  return { status: res.status, body: parsed ?? text };
}

export const sendTestIntake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mode: "valid" | "duplicate" | "idempotency" | "invalid" }) =>
    testModeSchema.parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const regnr = randomRegnr();
    const phone = "+46701234567";
    const email = "intake-test@minbilvardering.se";

    if (data.mode === "valid") {
      return await postSigned(
        {
          step: "valuation",
          regnummer: regnr,
          telefon: phone,
          email,
          namn: "Intake Test",
          matarstallning: "8000-12000",
          gdpr_consent: true,
        },
        randomUUID(),
      );
    }

    if (data.mode === "invalid") {
      // Saknar telefon + email
      return await postSigned(
        {
          step: "valuation",
          regnummer: regnr,
          namn: "Ogiltig Test",
          gdpr_consent: true,
        },
        randomUUID(),
      );
    }

    if (data.mode === "duplicate") {
      // Skapa först, postad sen igen med ny idem-key
      const payload = {
        step: "valuation" as const,
        regnummer: regnr,
        telefon: phone,
        email,
        namn: "Dubblett Test",
        gdpr_consent: true,
      };
      const first = await postSigned(payload, randomUUID());
      const second = await postSigned(payload, randomUUID());
      return { first, second };
    }

    if (data.mode === "idempotency") {
      const idem = randomUUID();
      const payload = {
        step: "valuation" as const,
        regnummer: regnr,
        telefon: phone,
        email,
        namn: "Idempotency Test",
        gdpr_consent: true,
      };
      const first = await postSigned(payload, idem);
      const second = await postSigned(payload, idem);
      return { first, second };
    }

    throw new Error("Okänt testläge");
  });
