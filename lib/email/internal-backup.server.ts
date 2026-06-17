// Internt backup-mail med all tillgänglig leaddata efter steg 2 (extras).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEmail } from "./resend.server";

function row(label: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  const v = Array.isArray(value) ? value.join(", ") : String(value);
  return `${label}: ${v}\n`;
}

function htmlRow(label: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  const v = Array.isArray(value) ? value.join(", ") : String(value);
  return `<tr><td style="padding:4px 12px 4px 0;color:#555;vertical-align:top"><strong>${label}</strong></td><td style="padding:4px 0">${v}</td></tr>`;
}

export async function sendInternalLeadBackupEmail(leadId: string): Promise<void> {
  const to = process.env.EMAIL_FROM;
  if (!to) {
    console.warn("EMAIL_FROM saknas, hoppar internt backup-mail");
    return;
  }

  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select(
      "id, registration_number, phone, email, customer_name, equipment_notes, extras_list, sell_timeframe, free_text",
    )
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return;

  const { data: vehicle } = await supabaseAdmin
    .from("vehicles")
    .select("mileage_mil, keys_count, service_book, tires, summer_tires_notes, winter_tires_notes")
    .eq("lead_id", leadId)
    .maybeSingle();

  const { data: files } = await supabaseAdmin
    .from("files")
    .select("storage_path")
    .eq("lead_id", leadId)
    .is("deleted_at", null);

  const imageUrls: string[] = [];
  for (const f of files ?? []) {
    if (!f.storage_path) continue;
    const { data: signed } = await supabaseAdmin.storage
      .from("lead-photos")
      .createSignedUrl(f.storage_path, 60 * 60 * 24 * 7);
    if (signed?.signedUrl) imageUrls.push(signed.signedUrl);
  }

  const regnr = lead.registration_number ?? "";
  const subject = `Komplett lead: ${regnr}`;

  const tyres = [vehicle?.tires, vehicle?.summer_tires_notes, vehicle?.winter_tires_notes]
    .filter(Boolean)
    .join(" | ");

  const text =
    row("Regnummer", regnr) +
    row("Telefon", lead.phone) +
    row("E-post", lead.email) +
    row("Mätarställning (mil)", vehicle?.mileage_mil) +
    row("Namn", lead.customer_name) +
    row("Nycklar", vehicle?.keys_count) +
    row("Servicebok", vehicle?.service_book) +
    row("Däck", tyres) +
    row("Utrustningspaket", lead.equipment_notes) +
    row("Tillval", lead.extras_list) +
    row("Säljstid", lead.sell_timeframe) +
    row("Kommentar", lead.free_text) +
    (imageUrls.length ? `\nBilder:\n${imageUrls.join("\n")}\n` : "");

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#111">
  <h2 style="margin:0 0 16px">Komplett lead: ${regnr}</h2>
  <table style="border-collapse:collapse;font-size:14px">
    ${htmlRow("Regnummer", regnr)}
    ${htmlRow("Telefon", lead.phone)}
    ${htmlRow("E-post", lead.email)}
    ${htmlRow("Mätarställning (mil)", vehicle?.mileage_mil)}
    ${htmlRow("Namn", lead.customer_name)}
    ${htmlRow("Nycklar", vehicle?.keys_count)}
    ${htmlRow("Servicebok", vehicle?.service_book)}
    ${htmlRow("Däck", tyres)}
    ${htmlRow("Utrustningspaket", lead.equipment_notes)}
    ${htmlRow("Tillval", Array.isArray(lead.extras_list) ? lead.extras_list.join(", ") : lead.extras_list)}
    ${htmlRow("Säljstid", lead.sell_timeframe)}
    ${htmlRow("Kommentar", lead.free_text)}
  </table>
  ${
    imageUrls.length
      ? `<h3 style="margin:24px 0 8px">Bilder</h3><ul>${imageUrls.map((u) => `<li><a href="${u}">${u}</a></li>`).join("")}</ul>`
      : ""
  }
</div>`;

  try {
    await sendEmail({ to, subject, text, html });
  } catch (e) {
    console.error("Internt backup-mail misslyckades:", e);
  }
}
