// PDF-generering för fakturaunderlag.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type Row = {
  created_at: string;
  description: string | null;
  amount: number;
  reference?: string | null;
  event_type: string;
};

export async function buildInvoicePdf(opts: {
  dealer: {
    company_name: string;
    org_number?: string | null;
    address?: string | null;
    city?: string | null;
  };
  company: {
    name: string;
    address?: string | null;
    org_number?: string | null;
    bank_details?: string | null;
    vat_rate: number;
  };
  period: string;
  rows: Row[];
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0, 0, 0);
  const grey = rgb(0.5, 0.5, 0.5);

  let y = 800;
  const left = 50;
  const right = 545;

  page.drawText(opts.company.name, { x: left, y, size: 16, font: bold, color: black });
  y -= 22;
  page.drawText("Fakturaunderlag", { x: left, y, size: 13, font: bold, color: black });
  y -= 18;
  const periodLabel = formatPeriod(opts.period);
  page.drawText(`Period: ${periodLabel}`, { x: left, y, size: 10, font, color: black });
  y -= 12;
  page.drawText(`Genererat: ${new Date().toLocaleString("sv-SE")}`, {
    x: left,
    y,
    size: 10,
    font,
    color: grey,
  });

  y -= 30;
  page.drawText("Till:", { x: left, y, size: 10, font: bold, color: black });
  y -= 14;
  page.drawText(opts.dealer.company_name, { x: left, y, size: 11, font: bold, color: black });
  y -= 13;
  if (opts.dealer.org_number) {
    page.drawText(`Org.nr: ${opts.dealer.org_number}`, { x: left, y, size: 10, font, color: black });
    y -= 12;
  }
  if (opts.dealer.address) {
    page.drawText(opts.dealer.address, { x: left, y, size: 10, font, color: black });
    y -= 12;
  }
  if (opts.dealer.city) {
    page.drawText(opts.dealer.city, { x: left, y, size: 10, font, color: black });
    y -= 12;
  }

  y -= 14;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: grey });
  y -= 16;
  page.drawText("Datum", { x: left, y, size: 9, font: bold, color: black });
  page.drawText("Referens", { x: left + 80, y, size: 9, font: bold, color: black });
  page.drawText("Beskrivning", { x: left + 180, y, size: 9, font: bold, color: black });
  page.drawText("Belopp", { x: right - 60, y, size: 9, font: bold, color: black });
  y -= 6;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: grey });
  y -= 14;

  let subtotal = 0;
  for (const r of opts.rows) {
    if (y < 120) {
      const np = pdf.addPage([595, 842]);
      y = 800;
      np.drawText("Fakturaunderlag (forts.)", { x: left, y, size: 11, font: bold, color: black });
      y -= 24;
    }
    const date = new Date(r.created_at).toLocaleDateString("sv-SE");
    page.drawText(date, { x: left, y, size: 9, font, color: black });
    page.drawText(r.reference ?? "", { x: left + 80, y, size: 9, font, color: black });
    const desc = (r.description ?? "").substring(0, 60);
    page.drawText(desc, { x: left + 180, y, size: 9, font, color: black });
    page.drawText(`${r.amount.toLocaleString("sv-SE")} kr`, {
      x: right - 60,
      y,
      size: 9,
      font,
      color: black,
    });
    subtotal += r.amount;
    y -= 14;
  }

  y -= 8;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: grey });
  y -= 18;
  const vat = Math.round((subtotal * opts.company.vat_rate) / 100);
  const total = subtotal + vat;

  page.drawText("Total exkl. moms:", { x: right - 200, y, size: 10, font, color: black });
  page.drawText(`${subtotal.toLocaleString("sv-SE")} kr`, { x: right - 60, y, size: 10, font, color: black });
  y -= 14;
  page.drawText(`Moms ${opts.company.vat_rate}%:`, { x: right - 200, y, size: 10, font, color: black });
  page.drawText(`${vat.toLocaleString("sv-SE")} kr`, { x: right - 60, y, size: 10, font, color: black });
  y -= 14;
  page.drawText("Totalt att fakturera:", { x: right - 200, y, size: 11, font: bold, color: black });
  page.drawText(`${total.toLocaleString("sv-SE")} kr`, { x: right - 60, y, size: 11, font: bold, color: black });

  y -= 30;
  page.drawText(
    "Detta är ett fakturaunderlag — inte en formell faktura. Använd som referens vid",
    { x: left, y, size: 8, font, color: grey },
  );
  y -= 10;
  page.drawText("fakturering via Fortnox eller annat system.", {
    x: left,
    y,
    size: 8,
    font,
    color: grey,
  });

  if (opts.company.bank_details) {
    y -= 18;
    page.drawText(opts.company.bank_details, { x: left, y, size: 8, font, color: grey });
  }

  return await pdf.save();
}

function formatPeriod(period: string) {
  const months = [
    "Januari", "Februari", "Mars", "April", "Maj", "Juni",
    "Juli", "Augusti", "September", "Oktober", "November", "December",
  ];
  const [y, m] = period.split("-");
  return `${months[parseInt(m, 10) - 1]} ${y}`;
}

export async function uploadInvoicePdf(
  dealerId: string,
  period: string,
  bytes: Uint8Array,
): Promise<string> {
  const path = `${dealerId}/${period}-${Date.now()}.pdf`;
  const { error } = await supabaseAdmin.storage
    .from("invoices")
    .upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (error) throw error;
  const { data, error: signErr } = await supabaseAdmin.storage
    .from("invoices")
    .createSignedUrl(path, 60 * 60 * 24);
  if (signErr) throw signErr;
  return data.signedUrl;
}
