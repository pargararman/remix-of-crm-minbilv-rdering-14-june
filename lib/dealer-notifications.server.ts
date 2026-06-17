// Send notification emails + SMS to dealers when a lead is published.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendViaTwilio } from "@/lib/sms/twilio.server";

const FUEL_LABEL: Record<string, string> = {
  bensin: "Bensin",
  diesel: "Diesel",
  hybrid: "Hybrid",
  plugin_hybrid: "Plug-in hybrid",
  electric: "El",
  gas: "Gas",
  ethanol: "Etanol",
  other: "Annat",
};
const GEARBOX_LABEL: Record<string, string> = { manual: "Manuell", automatic: "Automat" };

function buildPortalUrl(leadId: string): string {
  const base =
    process.env.PORTAL_BASE_URL ||
    process.env.PUBLIC_SITE_URL ||
    "https://app.minbilvardering.se";
  // OBS: handlarportalens faktiska rutt är /dealer/cars/$leadId —
  // tidigare pekade länken på /handlare/bilar/... som gav 404.
  return `${base.replace(/\/$/, "")}/dealer/cars/${leadId}`;
}

async function sendDealerEmail(args: {
  dealer: any;
  lead: any;
  vehicle: any;
  publication: any;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const apiKey = process.env.LOVABLE_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!apiKey || !resendKey) return { ok: false, error: "Resend ej konfigurerad" };

  const { dealer, lead, vehicle, publication } = args;
  const v = vehicle ?? {};
  const subject = `Ny bil tillgänglig för bud — ${[v.brand, v.model, v.year].filter(Boolean).join(" ")}`;
  const cityLine = publication.share_city && lead.city ? `Stad: ${lead.city}\n` : "";
  const text = `Hej ${dealer.contact_person ?? dealer.company_name}!

En ny bil har publicerats för dig på Min Bil Värdering.se:

${[v.brand, v.model, v.year].filter(Boolean).join(" ")}
Miltal: ${v.mileage_mil ?? "—"} mil
Bränsle: ${FUEL_LABEL[v.fuel] ?? v.fuel ?? "—"}
Växellåda: ${GEARBOX_LABEL[v.gearbox] ?? v.gearbox ?? "—"}
${cityLine}Match: ${publication.match_score ?? 0}% — ${(publication.match_reasons ?? []).join(", ")}

Logga in i handlarportalen för att se bilder och lägga bud:
${buildPortalUrl(lead.id)}

Med vänliga hälsningar
Min Bil Värdering.se
`;
  const html = text
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br/>");

  try {
    const res = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-Connection-Api-Key": resendKey,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || "Min Bil Värdering <onboarding@resend.dev>",
        to: [dealer.email],
        subject,
        text,
        html: `<p>${html}</p>`,
      }),
    });
    const json: any = await res.json();
    if (!res.ok) return { ok: false, error: json?.message ?? `HTTP ${res.status}` };
    return { ok: true, id: json?.id };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

async function sendDealerSms(args: {
  dealer: any;
  lead: any;
  vehicle: any;
  publication: any;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!from) return { ok: false, error: "TWILIO_PHONE_NUMBER saknas" };
  const { dealer, lead, vehicle, publication } = args;
  if (!dealer.phone) return { ok: false, error: "Dealer saknar telefon" };
  const v = vehicle ?? {};
  const car = [v.brand, v.model, v.year].filter(Boolean).join(" ");
  const cityPart = publication.share_city && lead.city ? `, ${lead.city}` : "";
  const body = `Ny bil tillgänglig: ${car}, ${v.mileage_mil ?? "?"} mil${cityPart}. Match ${publication.match_score ?? 0}%. Logga in: ${buildPortalUrl(lead.id)}`;
  try {
    const res = await sendViaTwilio({ from, to: dealer.phone, body });
    return { ok: true, id: res.sid };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

export async function notifyDealerOfPublication(args: {
  dealerId: string;
  leadId: string;
  publicationId: string;
}): Promise<void> {
  const { data: dealer } = await supabaseAdmin
    .from("dealers")
    .select("*")
    .eq("id", args.dealerId)
    .single();
  if (!dealer) return;
  const [{ data: lead }, { data: vehicle }, { data: pub }] = await Promise.all([
    supabaseAdmin.from("leads").select("id, city, region").eq("id", args.leadId).single(),
    supabaseAdmin.from("vehicles").select("*").eq("lead_id", args.leadId).maybeSingle(),
    supabaseAdmin.from("lead_dealer_publications").select("*").eq("id", args.publicationId).single(),
  ]);
  if (!lead || !pub) return;

  const v: any = vehicle ?? {};
  // Filter rules
  const skipBrand =
    (dealer as any).notify_only_preferred_brands &&
    (dealer as any).preferred_brands?.length > 0 &&
    v.brand &&
    !(dealer as any).preferred_brands.includes(v.brand);
  const skipRadius = false; // radius is enforced during matching; honored here implicitly.

  if (skipBrand || skipRadius) return;

  let anySent = false;

  if ((dealer as any).notify_via_email && dealer.email) {
    const r = await sendDealerEmail({ dealer, lead, vehicle, publication: pub });
    await supabaseAdmin.from("dealer_notifications").insert({
      dealer_id: args.dealerId,
      lead_id: args.leadId,
      channel: "email",
      status: r.ok ? "sent" : "failed",
      external_id: r.id,
      error: r.error,
    } as never);
    if (r.ok) anySent = true;
  }

  if ((dealer as any).notify_via_sms && (dealer as any).phone) {
    const r = await sendDealerSms({ dealer, lead, vehicle, publication: pub });
    await supabaseAdmin.from("dealer_notifications").insert({
      dealer_id: args.dealerId,
      lead_id: args.leadId,
      channel: "sms",
      status: r.ok ? "sent" : "failed",
      external_id: r.id,
      error: r.error,
    } as never);
    if (r.ok) anySent = true;
  }

  if (anySent) {
    await supabaseAdmin
      .from("lead_dealer_publications")
      .update({ notified_at: new Date().toISOString() } as never)
      .eq("id", args.publicationId);
  }
}

// --- Generisk kort-notis (mejl + SMS) som respekterar handlarens kanalval ---
async function sendShortNotification(args: {
  dealerId: string;
  leadId: string;
  subject: string;
  message: string;
  requireFlag?: "notify_on_outbid" | "notify_on_won";
}): Promise<void> {
  const { data: dealer } = await supabaseAdmin
    .from("dealers")
    .select("*")
    .eq("id", args.dealerId)
    .single();
  if (!dealer) return;
  if (args.requireFlag && (dealer as any)[args.requireFlag] === false) return;

  const apiKey = process.env.LOVABLE_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const fromPhone = process.env.TWILIO_PHONE_NUMBER;

  if ((dealer as any).notify_via_email && dealer.email && apiKey && resendKey) {
    let r: { ok: boolean; id?: string; error?: string };
    try {
      const res = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "X-Connection-Api-Key": resendKey,
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || "Min Bil Värdering <onboarding@resend.dev>",
          to: [dealer.email],
          subject: args.subject,
          text: args.message,
          html: `<p>${args.message.replace(/\n/g, "<br/>")}</p>`,
        }),
      });
      const json: any = await res.json();
      r = res.ok ? { ok: true, id: json?.id } : { ok: false, error: json?.message ?? `HTTP ${res.status}` };
    } catch (e: any) {
      r = { ok: false, error: e?.message ?? String(e) };
    }
    await supabaseAdmin.from("dealer_notifications").insert({
      dealer_id: args.dealerId,
      lead_id: args.leadId,
      channel: "email",
      status: r.ok ? "sent" : "failed",
      external_id: r.id,
      error: r.error,
    } as never);
  }

  if ((dealer as any).notify_via_sms && (dealer as any).phone && fromPhone) {
    let r: { ok: boolean; id?: string; error?: string };
    try {
      const res = await sendViaTwilio({ from: fromPhone, to: (dealer as any).phone, body: args.message });
      r = { ok: true, id: res.sid };
    } catch (e: any) {
      r = { ok: false, error: e?.message ?? String(e) };
    }
    await supabaseAdmin.from("dealer_notifications").insert({
      dealer_id: args.dealerId,
      lead_id: args.leadId,
      channel: "sms",
      status: r.ok ? "sent" : "failed",
      external_id: r.id,
      error: r.error,
    } as never);
  }
}

async function carLabel(leadId: string): Promise<string> {
  const { data: vehicle } = await supabaseAdmin
    .from("vehicles")
    .select("brand, model, year")
    .eq("lead_id", leadId)
    .maybeSingle();
  const v: any = vehicle ?? {};
  return [v.brand, v.model, v.year].filter(Boolean).join(" ") || "bilen";
}

// --- Överbjuden ---
export async function notifyDealerOutbid(args: {
  dealerId: string;
  leadId: string;
  newHighestBid: number;
}): Promise<void> {
  const car = await carLabel(args.leadId);
  const kr = args.newHighestBid.toLocaleString("sv-SE");
  await sendShortNotification({
    dealerId: args.dealerId,
    leadId: args.leadId,
    requireFlag: "notify_on_outbid",
    subject: `Du har blivit överbjuden — ${car}`,
    message: `Du har blivit överbjuden på ${car}. Högsta bud är nu ${kr} kr. Lägg ett nytt bud: ${buildPortalUrl(args.leadId)}`,
  });
}

// --- Vunnen auktion/affär ---
export async function notifyDealerWon(args: {
  dealerId: string;
  leadId: string;
  finalPrice: number | null;
}): Promise<void> {
  const car = await carLabel(args.leadId);
  const pricePart = args.finalPrice != null ? ` för ${args.finalPrice.toLocaleString("sv-SE")} kr` : "";
  await sendShortNotification({
    dealerId: args.dealerId,
    leadId: args.leadId,
    requireFlag: "notify_on_won",
    subject: `Grattis — du vann ${car}`,
    message: `Grattis! Du vann ${car}${pricePart}. Min Bil Värdering kontaktar dig om nästa steg (kontrakt och hämtning). Se affären: ${buildPortalUrl(args.leadId)}`,
  });
}
