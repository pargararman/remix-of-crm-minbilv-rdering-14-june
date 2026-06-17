import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { ErrorBoundary } from "@/components/error-boundary";

// Hard ceiling so the auth gate can NEVER spin on "Verifierar inloggning…"
// forever. If no auth event has arrived by now (GoTrue LockManager contention
// or a missing INITIAL_SESSION), we stop waiting and route to /login instead
// of leaving the user stuck on a spinner.
const AUTH_RESOLVE_TIMEOUT_MS = 8000;

export const Route = createFileRoute("/_authenticated")({
  // IMPORTANT: there is deliberately NO blocking `await supabase.auth.getSession()`
  // here anymore. getSession() acquires the exclusive GoTrue auth-token lock and
  // can hang for many seconds — or deadlock entirely when several getSession()
  // calls re-enter the lock (beforeLoad + the render query + auth-recovery all
  // racing). That stall is what froze the whole app on "Verifierar inloggning…".
  // The gate below resolves the session via onAuthStateChange (which pushes the
  // persisted session WITHOUT taking that lock) plus a wall-clock timeout.
  component: AuthGate,
});

type GateState =
  | { status: "pending" }
  | { status: "authed"; session: Session }
  | { status: "anon" };

function AuthGate() {
  const navigate = useNavigate();
  const [state, setState] = useState<GateState>({ status: "pending" });

  useEffect(() => {
    let settled = false;

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      settled = true;
      console.debug("[supabase-auth]", event, {
        ts: Date.now(),
        hasSession: !!session,
        expiresAt: session?.expires_at,
        userId: session?.user?.id,
      });
      if (!session) {
        setState({ status: "anon" });
        return;
      }
      // Redirect dealer users to the dealer portal.
      (async () => {
        const { data: du } = await supabase
          .from("dealer_users")
          .select("dealer_id")
          .eq("user_id", session.user.id)
          .maybeSingle();
        if (du?.dealer_id) {
          window.location.href = "/dealer";
          return;
        }
        setState({ status: "authed", session });
      })();
    });

    const timeoutId = window.setTimeout(() => {
      if (!settled) {
        console.warn("[supabase-auth] no auth event within timeout — treating as signed out");
        setState({ status: "anon" });
      }
    }, AUTH_RESOLVE_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeoutId);
      sub.subscription.unsubscribe();
    };
  }, []);


  useEffect(() => {
    if (state.status === "anon") {
      navigate({ to: "/login", search: { redirect: window.location.href } });
    }
  }, [state.status, navigate]);

  // Pure diagnostic — kept from the original gate. Logs tab visibility changes
  // so the post-tab-switch behaviour stays observable in the console.
  useEffect(() => {
    const onVisible = () => {
      console.debug("[tab-visibility]", {
        ts: Date.now(),
        hidden: document.hidden,
        visibilityState: document.visibilityState,
      });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  if (state.status !== "authed") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p className="text-sm">Verifierar inloggning…</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <AppShell>
        <Outlet />
      </AppShell>
    </ErrorBoundary>
  );
}
