// Skickar SMS till alla i staffen (säljare, admins, owners) med ett
// notification_phone när en ny lead kommer in via intake.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendViaTwilio } from "./twilio.server";

interface NotifyArgs {
  leadId: string;
  regnummer: string | null;
  customerName: string | null;
}

export async function notifySellersNewLead(args: NotifyArgs): Promise<void> {
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!from) {
    console.error("notifySellersNewLead: TWILIO_PHONE_NUMBER saknas");
    return;
  }

  const { data: profiles, error } = await supabaseAdmin
    .from("profiles")
    .select("id, name, notification_phone, role")
    .in("role", ["seller", "admin"])
    .not("notification_phone", "is", null);

  if (error) {
    console.error("notifySellersNewLead: kunde inte hämta profiler:", error);
    return;
  }
  const recipients = (profiles ?? []).filter(
    (p) => typeof p.notification_phone === "string" && p.notification_phone.trim().length > 0,
  );
  if (recipients.length === 0) return;

  const upperRegnr = (args.regnummer ?? "").toUpperCase().replace(/\s/g, "");
  const biluppgifterUrl = upperRegnr
    ? `https://biluppgifter.se/fordon/${encodeURIComponent(upperRegnr)}`
    : "";

  const nameLine = args.customerName ? `Namn: ${args.customerName}\n` : "";
  const regnrLine = upperRegnr ? `Regnr: ${upperRegnr}\n` : "";
  const linkLine = biluppgifterUrl ? `Biluppgifter: ${biluppgifterUrl}\n` : "";

  const body = `Hej! Ny lead inkommen.\n${regnrLine}${nameLine}${linkLine}Lycka till!`;

  const testMode = process.env.SMS_TEST_MODE === "true";

  const results = await Promise.allSettled(
    recipients.map(async (p) => {
      const to = (p.notification_phone as string).trim();
      try {
        if (testMode) {
          console.log(`[SMS_TEST_MODE] notifySellersNewLead → ${to}: ${body}`);
        } else {
          await sendViaTwilio({ from, to, body });
        }
      } catch (e) {
        console.error(`notifySellersNewLead: SMS till ${to} misslyckades:`, e);
        throw e;
      }
    }),
  );

  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length > 0) {
    console.error("notifySellersNewLead: some recipients failed", failures);
    await supabaseAdmin.from("activity_timeline").insert({
      lead_id: args.leadId,
      type: "sms_notify_failed",
      description: `Misslyckades skicka SMS till ${failures.length} av ${recipients.length} mottagare`,
      actor_type: "system",
      metadata: { failed: failures.length, total: recipients.length },
    });
  }

  await supabaseAdmin.from("activity_timeline").insert({
    lead_id: args.leadId,
    type: "sellers_notified",
    description: `Notifierade ${recipients.length} säljare via SMS om ny lead`,
    actor_type: "system",
    metadata: { count: recipients.length },
  });
}

interface RepeatNotifyArgs {
  leadId: string;
  regnummer: string | null;
  customerName: string | null;
  currentStage: string | null;
  stageEnteredAt: string | null;
  submissionCount: number;
}

export async function notifySellersRepeatLead(args: RepeatNotifyArgs): Promise<void> {
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!from) {
    console.error("notifySellersRepeatLead: TWILIO_PHONE_NUMBER saknas");
    return;
  }

  // Debounce — skip if a repeat-SMS was already sent for this lead in last 24h.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await supabaseAdmin
    .from("activity_timeline")
    .select("id")
    .eq("lead_id", args.leadId)
    .eq("type", "repeat_sms_sent")
    .gte("created_at", since)
    .limit(1);
  if (recent && recent.length > 0) {
    console.log("[notifySellersRepeatLead] debounced — already sent within 24h");
    return;
  }

  const { data: profiles, error } = await supabaseAdmin
    .from("profiles")
    .select("id, name, notification_phone, role")
    .in("role", ["seller", "admin"])
    .not("notification_phone", "is", null);

  if (error) {
    console.error("notifySellersRepeatLead: kunde inte hämta profiler:", error);
    return;
  }
  const recipients = (profiles ?? []).filter(
    (p) => typeof p.notification_phone === "string" && p.notification_phone.trim().length > 0,
  );
  if (recipients.length === 0) return;

  const upperRegnr = (args.regnummer ?? "").toUpperCase().replace(/\s/g, "");
  const biluppgifterUrl = upperRegnr
    ? `https://biluppgifter.se/fordon/${encodeURIComponent(upperRegnr)}`
    : "";

  const stageLine = args.currentStage
    ? `Stage: ${args.currentStage}${args.stageEnteredAt ? ` (sedan ${args.stageEnteredAt.slice(0, 10)})` : ""}\n`
    : "";

  const body =
    `OBS! Återkommande kund.\n` +
    `Regnr: ${upperRegnr || "okänt"}\n` +
    (args.customerName ? `Namn: ${args.customerName}\n` : "") +
    stageLine +
    `Inkomst nr: ${args.submissionCount}\n` +
    (biluppgifterUrl ? `Biluppgifter: ${biluppgifterUrl}\n` : "") +
    `Tips: kunden återkommer — kolla tidigare anteckningar innan du ringer.\n` +
    `Lycka till!`;

  const testMode = process.env.SMS_TEST_MODE === "true";

  const results = await Promise.allSettled(
    recipients.map(async (p) => {
      const to = (p.notification_phone as string).trim();
      if (testMode) {
        console.log(`[SMS_TEST_MODE] notifySellersRepeatLead → ${to}: ${body}`);
      } else {
        await sendViaTwilio({ from, to, body });
      }
    }),
  );

  // Log so the debounce window catches further attempts.
  await supabaseAdmin.from("activity_timeline").insert({
    lead_id: args.leadId,
    type: "repeat_sms_sent",
    description: `Återkomst-SMS skickad till ${recipients.length} mottagare`,
    actor_type: "system",
    metadata: { count: recipients.length, submission_count: args.submissionCount },
  });

  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length > 0) {
    console.error("[notifySellersRepeatLead] failures", failures);
    await supabaseAdmin.from("activity_timeline").insert({
      lead_id: args.leadId,
      type: "sms_notify_failed",
      description: `Återkomst-SMS misslyckades för ${failures.length} av ${recipients.length} mottagare`,
      actor_type: "system",
      metadata: { failed: failures.length, total: recipients.length, kind: "repeat" },
    });
  }
}
