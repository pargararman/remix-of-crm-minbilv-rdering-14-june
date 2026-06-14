// Admin: konto- & behörighetsöversikt.
// Visar säljare/admins (profiles) och handlare (dealers + dealer_users) med
// kontostatus — vem som kan logga in i portalen och vem som saknar konto.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/integrations/supabase/role-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type StaffAccount = {
  id: string;
  name: string | null;
  email: string | null;
  role: "admin" | "seller";
  status: string | null;
  lastSignInAt: string | null;
  lastActivityAt: string | null; // senaste handling i systemet (audit_logs)
};

export type DealerAccount = {
  dealerId: string;
  companyName: string;
  city: string | null;
  status: string | null;
  pricingModel: string | null;
  hasAccount: boolean;
  users: { userId: string; email: string | null; lastSignInAt: string | null; lastActivityAt: string | null }[];
};

export const listAccountOverview = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const [{ data: profiles }, { data: dealers }, { data: dealerUsers }, { data: auditRows }] =
      await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("id, name, role, status")
          .in("role", ["admin", "seller"])
          .order("name"),
        supabaseAdmin
          .from("dealers")
          .select("id, company_name, city, status, pricing_model")
          .order("company_name"),
        supabaseAdmin.from("dealer_users").select("dealer_id, user_id"),
        // Senaste handling i systemet per användare (audit_logs).
        supabaseAdmin
          .from("audit_logs")
          .select("user_id, created_at")
          .order("created_at", { ascending: false }),
      ]);

    // Bygg en map userId → senaste audit-rad.
    const lastActivityById = new Map<string, string>();
    for (const row of auditRows ?? []) {
      if (row.user_id && !lastActivityById.has(row.user_id)) {
        lastActivityById.set(row.user_id, (row as any).created_at);
      }
    }

    // E-post + senaste inloggning från auth (admin-API:t).
    const authById = new Map<string, { email: string | null; lastSignInAt: string | null }>();
    try {
      let page = 1;
      // listUsers är paginerad — hämta upp till 1000 användare (10 sidor à 100).
      for (; page <= 10; page++) {
        const { data, error } = await (supabaseAdmin as any).auth.admin.listUsers({
          page,
          perPage: 100,
        });
        if (error || !data?.users?.length) break;
        for (const u of data.users) {
          authById.set(u.id, {
            email: u.email ?? null,
            lastSignInAt: u.last_sign_in_at ?? null,
          });
        }
        if (data.users.length < 100) break;
      }
    } catch (e) {
      console.error("listUsers failed (visar utan e-post):", e);
    }

    const staff: StaffAccount[] = (profiles ?? []).map((p: any) => ({
      id: p.id,
      name: p.name,
      email: authById.get(p.id)?.email ?? null,
      role: p.role,
      status: p.status ?? null,
      lastSignInAt: authById.get(p.id)?.lastSignInAt ?? null,
      lastActivityAt: lastActivityById.get(p.id) ?? null,
    }));

    const usersByDealer = new Map<string, { userId: string; email: string | null; lastSignInAt: string | null; lastActivityAt: string | null }[]>();
    for (const du of dealerUsers ?? []) {
      const arr = usersByDealer.get((du as any).dealer_id) ?? [];
      arr.push({
        userId: (du as any).user_id,
        email: authById.get((du as any).user_id)?.email ?? null,
        lastSignInAt: authById.get((du as any).user_id)?.lastSignInAt ?? null,
        lastActivityAt: lastActivityById.get((du as any).user_id) ?? null,
      });
      usersByDealer.set((du as any).dealer_id, arr);
    }

    const dealerAccounts: DealerAccount[] = (dealers ?? []).map((d: any) => ({
      dealerId: d.id,
      companyName: d.company_name,
      city: d.city ?? null,
      status: d.status ?? null,
      pricingModel: d.pricing_model ?? null,
      hasAccount: (usersByDealer.get(d.id) ?? []).length > 0,
      users: usersByDealer.get(d.id) ?? [],
    }));

    return { staff, dealers: dealerAccounts };
  });

// Ändra roll för en staff-användare (admin ↔ seller).
export const updateStaffRole = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((i) =>
    z.object({ userId: z.string().uuid(), role: z.enum(["admin", "seller"]) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const actorId = (context as any).userId as string;
    if (data.userId === actorId && data.role !== "admin") {
      throw new Error("Du kan inte ta bort din egen adminroll");
    }
    const { data: old } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", data.userId)
      .maybeSingle();
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ role: data.role } as never)
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_logs").insert({
      user_id: actorId,
      action: "staff_role_changed",
      object_type: "profile",
      object_id: data.userId,
      old_value: { role: (old as any)?.role } as never,
      new_value: { role: data.role } as never,
    } as never);
    return { ok: true };
  });

// Skapa portalkonto för en handlare (inbjudan via e-post).
export const inviteDealerUser = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((i) =>
    z.object({ dealerId: z.string().uuid(), email: z.string().email().max(255) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const actorId = (context as any).userId as string;
    const { data: dealer } = await supabaseAdmin
      .from("dealers")
      .select("id, company_name")
      .eq("id", data.dealerId)
      .maybeSingle();
    if (!dealer) throw new Error("Handlare saknas");

    // Skapa/återanvänd auth-användare via inbjudan (skickar magic link).
    const { data: invited, error: invErr } = await (supabaseAdmin as any).auth.admin.inviteUserByEmail(
      data.email,
      { data: { dealer_id: data.dealerId, company_name: (dealer as any).company_name } },
    );
    if (invErr) throw new Error(`Inbjudan misslyckades: ${invErr.message}`);
    const userId = invited?.user?.id;
    if (!userId) throw new Error("Kunde inte skapa användare");

    const { error: linkErr } = await supabaseAdmin
      .from("dealer_users")
      .upsert({ dealer_id: data.dealerId, user_id: userId } as never, {
        onConflict: "dealer_id,user_id",
      });
    if (linkErr) throw new Error(linkErr.message);

    await supabaseAdmin.from("audit_logs").insert({
      user_id: actorId,
      action: "dealer_user_invited",
      object_type: "dealer",
      object_id: data.dealerId,
      new_value: { email: data.email, user_id: userId } as never,
    } as never);
    return { ok: true, userId };
  });

// ─────────────────────────────────────────────────────────────────────────────
// Lösenordshantering & kontoskapande (admin).
// ─────────────────────────────────────────────────────────────────────────────

const SITE_URL = "https://app.minbilvardering.se";

async function getAuthEmail(userId: string): Promise<string | null> {
  const { data, error } = await (supabaseAdmin as any).auth.admin.getUserById(userId);
  if (error) throw new Error(error.message);
  return data?.user?.email ?? null;
}

// Skickar Supabase-återställningsmejl till användarens e-post.
export const sendPasswordResetEmail = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((i) => z.object({ userId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const actorId = (context as any).userId as string;
    const email = await getAuthEmail(data.userId);
    if (!email) throw new Error("Användaren saknar e-post");
    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
      redirectTo: `${SITE_URL}/reset-password`,
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_logs").insert({
      user_id: actorId,
      action: "password_reset_sent",
      object_type: "auth_user",
      object_id: data.userId,
      new_value: { email } as never,
    } as never);
    return { ok: true, email };
  });

// Sätter nytt lösenord direkt på en användare (admin override).
export const adminSetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((i) =>
    z
      .object({
        userId: z.string().uuid(),
        password: z.string().min(8, "Minst 8 tecken").max(128),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const actorId = (context as any).userId as string;
    if (data.userId === actorId) {
      throw new Error(
        "Du kan inte sätta ditt eget lösenord härifrån — använd Skicka återställningslänk.",
      );
    }
    const { error } = await (supabaseAdmin as any).auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_logs").insert({
      user_id: actorId,
      action: "admin_password_set",
      object_type: "auth_user",
      object_id: data.userId,
      // ALDRIG lösenordstexten i loggen.
      new_value: { changed_at: new Date().toISOString() } as never,
    } as never);
    return { ok: true };
  });

// Skapa nytt säljar-/admin-konto direkt (utan mejlbekräftelse).
export const createStaffAccount = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((i) =>
    z
      .object({
        name: z.string().trim().min(1).max(100),
        email: z.string().email().max(255),
        role: z.enum(["admin", "seller"]),
        password: z.string().min(8).max(128),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const actorId = (context as any).userId as string;
    const { data: created, error } = await (supabaseAdmin as any).auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { name: data.name, role: data.role },
    });
    if (error) throw new Error(error.message);
    const userId = created?.user?.id;
    if (!userId) throw new Error("Kunde inte skapa användare");
    // handle_new_user-trigger skapar profilen; säkerställ namn + roll.
    await supabaseAdmin
      .from("profiles")
      .upsert(
        { id: userId, email: data.email, name: data.name, role: data.role, status: "active" } as never,
        { onConflict: "id" },
      );
    await supabaseAdmin.from("audit_logs").insert({
      user_id: actorId,
      action: "staff_account_created",
      object_type: "auth_user",
      object_id: userId,
      new_value: { email: data.email, role: data.role } as never,
    } as never);
    return { ok: true, userId };
  });

// Skapa nytt handlarportal-konto direkt och koppla till en handlare.
export const createDealerAccount = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((i) =>
    z
      .object({
        dealerId: z.string().uuid(),
        email: z.string().email().max(255),
        password: z.string().min(8).max(128),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const actorId = (context as any).userId as string;
    const { data: dealer } = await supabaseAdmin
      .from("dealers")
      .select("id, company_name")
      .eq("id", data.dealerId)
      .maybeSingle();
    if (!dealer) throw new Error("Handlare saknas");

    const { data: created, error } = await (supabaseAdmin as any).auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { dealer_id: data.dealerId, company_name: (dealer as any).company_name },
    });
    if (error) throw new Error(error.message);
    const userId = created?.user?.id;
    if (!userId) throw new Error("Kunde inte skapa användare");

    const { error: linkErr } = await supabaseAdmin
      .from("dealer_users")
      .upsert({ dealer_id: data.dealerId, user_id: userId } as never, {
        onConflict: "dealer_id,user_id",
      });
    if (linkErr) throw new Error(linkErr.message);

    await supabaseAdmin.from("audit_logs").insert({
      user_id: actorId,
      action: "dealer_account_created",
      object_type: "dealer",
      object_id: data.dealerId,
      new_value: { email: data.email, user_id: userId } as never,
    } as never);
    return { ok: true, userId };
  });

// Ta bort ett handlarkonto — kopplar loss från dealer_users OCH tar bort
// auth-användaren så hen inte kan logga in längre.
export const removeDealerUser = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((i) =>
    z.object({ userId: z.string().uuid(), dealerId: z.string().uuid().optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const actorId = (context as any).userId as string;

    // Ta bort dealer_users-kopplingen (alla handlare om dealerId ej angivet).
    const q = supabaseAdmin.from("dealer_users").delete().eq("user_id", data.userId);
    if (data.dealerId) (q as any).eq("dealer_id", data.dealerId);
    const { error: linkErr } = await q;
    if (linkErr) throw new Error(linkErr.message);

    // Kolla om användaren fortfarande är kopplad till andra handlare.
    const { data: remaining } = await supabaseAdmin
      .from("dealer_users")
      .select("dealer_id")
      .eq("user_id", data.userId)
      .limit(1)
      .maybeSingle();

    // Ta bara bort auth-användaren om hen inte har kvar några handlarkopplingar.
    if (!remaining) {
      const { error: authErr } = await (supabaseAdmin as any).auth.admin.deleteUser(data.userId);
      if (authErr) throw new Error(`Kopplingen borttagen men auth-kontot kvarstår: ${authErr.message}`);
    }

    await supabaseAdmin.from("audit_logs").insert({
      user_id: actorId,
      action: "dealer_user_removed",
      object_type: "auth_user",
      object_id: data.userId,
      new_value: { dealer_id: data.dealerId ?? null, auth_deleted: !remaining } as never,
    } as never);
    return { ok: true };
  });
