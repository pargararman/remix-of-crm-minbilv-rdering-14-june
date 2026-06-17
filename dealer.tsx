import { createFileRoute, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/dealer")({
  component: DealerShell,
});

const tabs = [
  { to: "/dealer", label: "Tillgängliga bilar", exact: true },
  { to: "/dealer/bids", label: "Mina bud" },
  { to: "/dealer/active", label: "Aktiv affär" },
  { to: "/dealer/won", label: "Vunna" },
];

function DealerShell() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const [state, setState] = useState<"pending" | "ok" | "anon" | "no_dealer">("pending");

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user?.id;
      if (!uid) {
        if (!cancelled) setState("anon");
        return;
      }
      const { data: du } = await supabase
        .from("dealer_users")
        .select("dealer_id")
        .eq("user_id", uid)
        .maybeSingle();
      if (cancelled) return;
      setState(du?.dealer_id ? "ok" : "no_dealer");
    };
    check();
    const { data: sub } = supabase.auth.onAuthStateChange((_, s) => {
      if (!s) setState("anon");
      else check();
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (state === "anon") {
      navigate({ to: "/login", search: { redirect: window.location.href } });
    }
  }, [state, navigate]);

  if (state === "pending" || state === "anon") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (state === "no_dealer") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-xl font-semibold">Inget handlarkonto</h1>
          <p className="text-sm text-muted-foreground">
            Ditt konto är inte kopplat till någon handlare. Kontakta Min Bil Värdering.
          </p>
          <Button variant="outline" onClick={() => supabase.auth.signOut()}>
            Logga ut
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link to="/dealer" className="font-semibold tracking-tight">
            Min Bil Värdering · Handlare
          </Link>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={() => supabase.auth.signOut().then(() => navigate({ to: "/login" }))}>
            <LogOut className="h-4 w-4 mr-1" /> Logga ut
          </Button>
        </div>
        <nav className="max-w-5xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {tabs.map((t) => {
            const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
            return (
              <Link
                key={t.to}
                to={t.to}
                className={`px-3 py-2 text-sm border-b-2 whitespace-nowrap transition-colors ${
                  active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="max-w-5xl mx-auto p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  );
}
