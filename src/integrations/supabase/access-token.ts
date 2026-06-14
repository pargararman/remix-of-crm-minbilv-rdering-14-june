//
// Keeps a synchronously-readable copy of the current Supabase access token.
//
// Why this exists: every supabase-js data request internally awaits
// supabase.auth.getSession(), which can stall for many seconds on the GoTrue
// LockManager after a browser tab regains focus (auto-refresh lock contention).
// That stall is the real cause of the "save spins / times out after tab switch"
// bug. onAuthStateChange, by contrast, pushes the token to us (including an
// immediate INITIAL_SESSION from the persisted session) WITHOUT taking that
// lock, so we can read the token without ever blocking a save.
import { supabase } from "./client";

let currentToken: string | null = null;

if (typeof window !== "undefined") {
  // Primary source of truth: fires INITIAL_SESSION (from localStorage, no
  // network) right after subscribing, then again on every refresh/sign-in.
  supabase.auth.onAuthStateChange((_event, session) => {
    currentToken = session?.access_token ?? null;
  });

  // Belt-and-suspenders prime. Runs at module load, NEVER in the save path,
  // so even if this particular getSession stalls it cannot block a Spara click.
  void supabase.auth
    .getSession()
    .then(({ data }) => {
      currentToken = data.session?.access_token ?? currentToken;
    })
    .catch(() => {
      /* ignore — onAuthStateChange covers us */
    });
}

/** Returns the last known access token without touching the GoTrue lock. */
export function getAccessTokenSync(): string | null {
  return currentToken;
}
