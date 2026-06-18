// Auto-email vid lead-skapande.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEmail } from "./resend.server";

const SUBJECT = "Vi har tagit emot din bilförfrågan";

const TEXT_BODY = `Hej!

Tack för att du skickade in uppgifter om din bil.

Vi har tagit emot din förfrågan och kommer att kontakta dig inom kort.

Om du vill lägga till mer information kan du gärna svara på detta mejl eller på SMS:et vi skickat till dig. Det kan till exempel vara information om skick, servicehistorik, däck, nycklar, skador eller bilder.

Med vänliga hälsningar
Min Bil Värdering.se`;

const HTML_BODY = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">
  <p>Hej!</p>
  <p>Tack för att du skickade in uppgifter om din bil.</p>
  <p>Vi har tagit emot din förfrågan och kommer att kontakta dig inom kort.</p>
  <p>Om du vill lägga till mer information kan du gärna svara på detta mejl eller på SMS:et vi skickat till dig. Det kan till exempel vara information om skick, servicehistorik, däck, nycklar, skador eller bilder.</p>
  <p style="margin-top:32px">Med vänliga hälsningar<br/><strong>Min Bil Värdering.se</strong></p>
</div>`;

export async function sendIntakeEmail(leadId: string): Promise<void> {
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("id, email")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead?.email) return;

  let providerId = "";
  let status: "sent" | "failed" = "sent";
  try {
    const r = await sendEmail({
      to: lead.email,
      subject: SUBJECT,
      text: TEXT_BODY,
      html: HTML_BODY,
    });
    providerId = r.id;
  } catch (e) {
    status = "failed";
    console.error("Auto-email failed:", e);
  }

  await supabaseAdmin.from("email_log").insert({
    lead_id: leadId,
    template_code: "intake_email",
    to_email: lead.email,
    subject: SUBJECT,
    body: TEXT_BODY,
    provider_id: providerId,
    status,
  });

  if (status === "sent") {
    await supabaseAdmin.from("activity_timeline").insert({
      lead_id: leadId,
      type: "email_sent",
      description: "Auto-email skickat (välkomstmeddelande)",
      actor_type: "system",
    });
  }
}
