// Server fns för rapport-dashboard. Admin = full vy, seller = egen vy.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const Range = z.object({
  from: z.string(),
  to: z.string(),
  compare: z.boolean().default(false),
});

async function isAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  return (data as any)?.role === "admin";
}

function prevRange(from: string, to: string) {
  const f = new Date(from).getTime();
  const t = new Date(to).getTime();
  const span = t - f;
  return {
    from: new Date(f - span - 86400_000).toISOString(),
    to: new Date(t - span - 86400_000).toISOString(),
  };
}

// ---------- LEADS ----------
export const getLeadsReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => Range.parse(i))
  .handler(async ({ data, context }) => {
    const admin = await isAdmin(context.userId!);
    const base = supabaseAdmin
      .from("leads")
      .select("id, created_at, source, stage, city, region, lead_score, owner_id")
      .gte("created_at", data.from)
      .lte("created_at", data.to);
    const { data: leads } = admin
      ? await base
      : await base.eq("owner_id", context.userId!);

    const all = (leads ?? []) as any[];
    const total = all.length;
    const active = all.filter((l) => !["forlorad"].includes(l.stage) && !l.archived_at).length;
    const wonStages = all.filter((l) => l.stage === "vunnen");

    // Wons from won_deals för värde
    const ids = all.map((l) => l.id);
    let wonTotal = 0;
    if (ids.length) {
      const { data: wd } = await supabaseAdmin
        .from("won_deals")
        .select("final_price, lead_id")
        .in("lead_id", ids);
      wonTotal = ((wd ?? []) as any[]).reduce((s, w) => s + (w.final_price ?? 0), 0);
    }
    const conv = total ? (wonStages.length / total) * 100 : 0;
    const avgScore = total
      ? Math.round(all.reduce((s, l) => s + (l.lead_score ?? 0), 0) / total)
      : 0;

    // bucket per dag
    const perDay = new Map<string, number>();
    for (const l of all) {
      const d = l.created_at.substring(0, 10);
      perDay.set(d, (perDay.get(d) ?? 0) + 1);
    }
    const timeseries = Array.from(perDay.entries())
      .sort()
      .map(([date, count]) => ({ date, count }));

    const bySource = bucket(all, (l) => l.source ?? "manual");
    const byStage = bucket(all, (l) => l.stage);
    const byCity = bucket(all, (l) => l.city ?? "Okänd").slice(0, 10);

    // Brand requires vehicles join
    let byBrand: Array<{ key: string; count: number }> = [];
    if (ids.length) {
      const { data: vs } = await supabaseAdmin
        .from("vehicles")
        .select("brand")
        .in("lead_id", ids);
      byBrand = bucket((vs ?? []) as any[], (v) => v.brand ?? "Okänd").slice(0, 15);
    }

    // Lead score buckets
    const scoreBuckets = [
      { key: "0-39", count: 0 },
      { key: "40-59", count: 0 },
      { key: "60-79", count: 0 },
      { key: "80-100", count: 0 },
    ];
    for (const l of all) {
      const s = l.lead_score ?? 0;
      if (s < 40) scoreBuckets[0].count++;
      else if (s < 60) scoreBuckets[1].count++;
      else if (s < 80) scoreBuckets[2].count++;
      else scoreBuckets[3].count++;
    }

    return {
      kpis: {
        total,
        active,
        won_count: wonStages.length,
        won_value: wonTotal,
        conv_rate: conv,
        avg_score: avgScore,
      },
      timeseries,
      by_source: bySource,
      by_stage: byStage,
      by_city: byCity,
      by_brand: byBrand,
      score_buckets: scoreBuckets,
    };
  });

function bucket<T>(arr: T[], key: (t: T) => string) {
  const m = new Map<string, number>();
  for (const it of arr) m.set(key(it), (m.get(key(it)) ?? 0) + 1);
  return Array.from(m.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([k, count]) => ({ key: k, count }));
}

// ---------- SELLER ----------
export const getSellerReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => Range.parse(i))
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context.userId!))) throw new Error("Endast admin");
    const { data: sellers } = await supabaseAdmin
      .from("profiles")
      .select("id, name, email")
      .eq("role", "seller");
    const rows: any[] = [];
    for (const s of sellers ?? []) {
      const sid = (s as any).id;
      const { data: leads } = await supabaseAdmin
        .from("leads")
        .select("id, stage")
        .eq("owner_id", sid)
        .gte("created_at", data.from)
        .lte("created_at", data.to);
      const assigned = (leads ?? []).length;
      const ids = (leads ?? []).map((l: any) => l.id);
      const won = (leads ?? []).filter((l: any) => l.stage === "vunnen").length;
      const lost = (leads ?? []).filter((l: any) => l.stage === "forlorad").length;
      let smsCount = 0;
      let callCount = 0;
      if (ids.length) {
        const [{ count: sc }, { count: cc }] = await Promise.all([
          supabaseAdmin
            .from("messages")
            .select("id", { count: "exact", head: true })
            .in("lead_id", ids)
            .eq("direction", "outbound")
            .eq("sender_id", sid),
          supabaseAdmin
            .from("call_logs")
            .select("id", { count: "exact", head: true })
            .in("lead_id", ids)
            .eq("seller_id", sid),
        ]);
        smsCount = sc ?? 0;
        callCount = cc ?? 0;
      }
      rows.push({
        seller_id: sid,
        name: (s as any).name ?? (s as any).email,
        assigned,
        sms_sent: smsCount,
        calls: callCount,
        won,
        lost,
        conv_rate: assigned ? (won / assigned) * 100 : 0,
      });
    }
    return { rows };
  });

export const getSellerDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    Range.extend({ user_id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context.userId!)) && data.user_id !== context.userId)
      throw new Error("Saknar åtkomst");
    const { data: leads } = await supabaseAdmin
      .from("leads")
      .select("id, stage, lost_reason_code, created_at")
      .eq("owner_id", data.user_id)
      .gte("created_at", data.from)
      .lte("created_at", data.to);
    const all = (leads ?? []) as any[];
    const lostReasons = bucket(
      all.filter((l) => l.lost_reason_code),
      (l) => l.lost_reason_code as string,
    );
    return { leads: all, lost_reasons: lostReasons };
  });

// ---------- DEALER ----------
export const getDealerReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => Range.parse(i))
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context.userId!))) throw new Error("Endast admin");
    const { data: dealers } = await supabaseAdmin
      .from("dealers")
      .select("id, company_name, status");
    const rows: any[] = [];
    for (const d of dealers ?? []) {
      const did = (d as any).id;
      const [pubs, offers, wons, activity, billing] = await Promise.all([
        supabaseAdmin
          .from("lead_dealer_publications")
          .select("id, first_viewed_at, view_count")
          .eq("dealer_id", did)
          .gte("created_at", data.from)
          .lte("created_at", data.to),
        supabaseAdmin
          .from("dealer_offers")
          .select("id, created_at, lead_id")
          .eq("dealer_id", did)
          .gte("created_at", data.from)
          .lte("created_at", data.to),
        supabaseAdmin
          .from("won_deals")
          .select("id, final_price")
          .eq("dealer_id", did)
          .gte("won_at", data.from)
          .lte("won_at", data.to),
        supabaseAdmin
          .from("dealer_activity")
          .select("id")
          .eq("dealer_id", did)
          .gte("created_at", data.from)
          .lte("created_at", data.to),
        supabaseAdmin
          .from("billing_logs")
          .select("amount")
          .eq("dealer_id", did)
          .gte("created_at", data.from)
          .lte("created_at", data.to),
      ]);
      const assigned = pubs.data?.length ?? 0;
      const viewed = (pubs.data ?? []).filter((p: any) => p.first_viewed_at).length;
      const bids = offers.data?.length ?? 0;
      const won = wons.data?.length ?? 0;
      const billingTotal = ((billing.data ?? []) as any[]).reduce(
        (s, b) => s + (b.amount ?? 0),
        0,
      );
      const bidRate = viewed ? bids / viewed : 0;
      const accRate = bids ? won / bids : 0;
      const loginFreq = Math.min(1, (activity.data?.length ?? 0) / 30);
      const reliability = (bidRate * 0.4 + accRate * 0.3 + loginFreq * 0.3) * 10;
      rows.push({
        dealer_id: did,
        name: (d as any).company_name,
        assigned,
        viewed,
        bids,
        won,
        lost: assigned - won,
        win_rate: assigned ? (won / assigned) * 100 : 0,
        activity: activity.data?.length ?? 0,
        billing_total: billingTotal,
        reliability: Math.round(reliability * 10) / 10,
      });
    }
    return { rows };
  });

export const getDealerDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => Range.extend({ dealer_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context.userId!))) throw new Error("Endast admin");
    const { data: pubs } = await supabaseAdmin
      .from("lead_dealer_publications")
      .select("id, created_at, lead_id, first_viewed_at, view_count, match_score")
      .eq("dealer_id", data.dealer_id)
      .gte("created_at", data.from)
      .lte("created_at", data.to);
    const { data: offers } = await supabaseAdmin
      .from("dealer_offers")
      .select("id, amount, created_at, lead_id")
      .eq("dealer_id", data.dealer_id)
      .gte("created_at", data.from)
      .lte("created_at", data.to);
    return { publications: pubs ?? [], offers: offers ?? [] };
  });

// ---------- SLA ----------
export const getSlaReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => Range.parse(i))
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context.userId!))) throw new Error("Endast admin");
    const { data: rows } = await supabaseAdmin
      .from("lead_sla_metrics")
      .select("*")
      .gte("created_at", data.from)
      .lte("created_at", data.to);
    const { data: settings } = await supabaseAdmin
      .from("company_settings")
      .select("sla_targets")
      .limit(1)
      .maybeSingle();
    const all = (rows ?? []) as any[];
    const avg = (key: string) => {
      const vals = all.map((r) => r[key]).filter((v) => v !== null && v !== undefined);
      if (!vals.length) return null;
      return vals.reduce((s: number, v: number) => s + Number(v), 0) / vals.length;
    };
    const { count: overdueTasks } = await supabaseAdmin
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("status", "open")
      .lt("due_date", new Date().toISOString());
    return {
      averages: {
        first_auto_sms_min: avg("t_first_auto_sms_min"),
        first_manual_touch_min: avg("t_first_manual_touch_min"),
        first_valuation_min: avg("t_first_valuation_min"),
        first_bid_hours: avg("t_first_bid_hours"),
        customer_accepted_hours: avg("t_customer_accepted_hours"),
        pickup_hours: avg("t_pickup_hours"),
        won_hours: avg("t_won_hours"),
      },
      targets: (settings as any)?.sla_targets ?? {},
      overdue_tasks: overdueTasks ?? 0,
      count: all.length,
    };
  });

export const getMySlaTile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
    const { data: rows } = await supabaseAdmin
      .from("lead_sla_metrics")
      .select("t_first_manual_touch_min, t_first_valuation_min")
      .eq("owner_id", context.userId!)
      .gte("created_at", weekAgo);
    const all = (rows ?? []) as any[];
    const avg = (k: string) => {
      const v = all.map((r) => r[k]).filter((x) => x !== null);
      return v.length ? v.reduce((s: number, x: number) => s + Number(x), 0) / v.length : null;
    };
    const { count: overdue } = await supabaseAdmin
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", context.userId!)
      .eq("status", "open")
      .lt("due_date", new Date().toISOString());
    const { data: settings } = await supabaseAdmin
      .from("company_settings")
      .select("sla_targets")
      .limit(1)
      .maybeSingle();
    return {
      first_manual_touch_min: avg("t_first_manual_touch_min"),
      first_valuation_min: avg("t_first_valuation_min"),
      overdue_tasks: overdue ?? 0,
      targets: (settings as any)?.sla_targets ?? {},
    };
  });

// ---------- LOST ----------
export const getLostReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => Range.parse(i))
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context.userId!))) throw new Error("Endast admin");
    const { data: rows } = await supabaseAdmin
      .from("leads")
      .select("id, lost_reason_code, lost_reason_text")
      .eq("stage", "forlorad")
      .gte("created_at", data.from)
      .lte("created_at", data.to);
    const all = (rows ?? []) as any[];
    const ids = all.map((r) => r.id);
    let pricing: any[] = [];
    if (ids.length) {
      const { data: pr } = await supabaseAdmin
        .from("pricing")
        .select("lead_id, in_price")
        .in("lead_id", ids);
      pricing = pr ?? [];
    }
    const priceMap = new Map(pricing.map((p) => [p.lead_id, p.in_price ?? 0]));
    const grouped = new Map<string, { count: number; value: number }>();
    for (const r of all) {
      const k = r.lost_reason_code ?? "okand";
      const cur = grouped.get(k) ?? { count: 0, value: 0 };
      cur.count++;
      cur.value += priceMap.get(r.id) ?? 0;
      grouped.set(k, cur);
    }
    return {
      total: all.length,
      reasons: Array.from(grouped.entries())
        .map(([key, v]) => ({ key, count: v.count, value: v.value }))
        .sort((a, b) => b.count - a.count),
    };
  });

// ---------- SOURCES ----------
export const getSourceReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => Range.parse(i))
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context.userId!))) throw new Error("Endast admin");
    const { data: leads } = await supabaseAdmin
      .from("leads")
      .select("id, source, stage, utm_source, utm_medium, utm_campaign")
      .gte("created_at", data.from)
      .lte("created_at", data.to);
    const all = (leads ?? []) as any[];
    const ids = all.map((l) => l.id);
    const valueMap = new Map<string, number>();
    if (ids.length) {
      const { data: wd } = await supabaseAdmin
        .from("won_deals")
        .select("lead_id, final_price")
        .in("lead_id", ids);
      for (const w of (wd ?? []) as any[]) valueMap.set(w.lead_id, w.final_price);
    }
    const grouped = new Map<string, { total: number; won: number; value: number }>();
    for (const l of all) {
      const k = l.source ?? "manual";
      const c = grouped.get(k) ?? { total: 0, won: 0, value: 0 };
      c.total++;
      if (l.stage === "vunnen") c.won++;
      c.value += valueMap.get(l.id) ?? 0;
      grouped.set(k, c);
    }
    return {
      sources: Array.from(grouped.entries()).map(([key, v]) => ({
        key,
        total: v.total,
        won: v.won,
        conv_rate: v.total ? (v.won / v.total) * 100 : 0,
        total_value: v.value,
        avg_per_won: v.won ? v.value / v.won : 0,
        avg_per_lead: v.total ? v.value / v.total : 0,
      })),
    };
  });
