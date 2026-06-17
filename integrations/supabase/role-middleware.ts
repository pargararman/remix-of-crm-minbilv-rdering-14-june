// Rollbaserade middlewares ovanpå requireSupabaseAuth.
//
// Bakgrund (säkerhetsgranskning 2026-06-12): flera serverfunktioner kör med
// admin-klienten (förbi RLS) och förlitade sig på mönstret
// `lead.owner_id && lead.owner_id !== userId` — vilket släppte igenom ALLA
// inloggade användare (inklusive handlarkonton) för leads utan ägare.
// Dessa middlewares stänger hålet: CRM-funktioner kräver staff-roll,
// adminfunktioner kräver admin, handlarfunktioner kräver handlarkoppling.
import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AppRole = "admin" | "seller" | "dealer";

async function resolveRole(userId: string): Promise<{ role: AppRole | null; dealerId: string | null }> {
  const [{ data: profile }, { data: dealerUser }] = await Promise.all([
    supabaseAdmin.from("profiles").select("role").eq("id", userId).maybeSingle(),
    supabaseAdmin.from("dealer_users").select("dealer_id").eq("user_id", userId).maybeSingle(),
  ]);
  const role = ((profile as any)?.role as AppRole | undefined) ?? null;
  const dealerId = (dealerUser as any)?.dealer_id ?? null;
  // Handlarkoppling utan staff-profil ⇒ dealer.
  if (!role && dealerId) return { role: "dealer", dealerId };
  return { role, dealerId };
}

// Säljare eller admin — för alla CRM-funktioner.
export const requireStaff = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const userId = (context as any).userId as string;
    const { role, dealerId } = await resolveRole(userId);
    if (role !== "admin" && role !== "seller") {
      throw new Error("Åtkomst nekad: kräver säljar- eller adminroll");
    }
    return next({ context: { ...context, role, dealerId, isAdmin: role === "admin" } });
  });

// Endast admin — för inställningar, billing, behörigheter m.m.
export const requireAdmin = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const userId = (context as any).userId as string;
    const { role, dealerId } = await resolveRole(userId);
    if (role !== "admin") {
      throw new Error("Åtkomst nekad: kräver adminroll");
    }
    return next({ context: { ...context, role, dealerId, isAdmin: true } });
  });

// Inloggad användare kopplad till en handlare — för handlarportalen.
export const requireDealer = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const userId = (context as any).userId as string;
    const { role, dealerId } = await resolveRole(userId);
    if (!dealerId) {
      throw new Error("not_a_dealer");
    }
    return next({ context: { ...context, role: role ?? "dealer", dealerId, isAdmin: false } });
  });
