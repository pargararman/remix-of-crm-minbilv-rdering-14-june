// Diagnostic-only helpers. There is intentionally NO global blocking API
// here — a failed background `supabase.auth.getSession()` after a tab
// return must never poison or block subsequent saves. The save mutation
// owns the outcome via its own abortable timeout.

export type MaybeAuthError = {
  status?: number | null;
  code?: string | null;
  message?: string | null;
} | null | undefined;

// Defensive detector. Supabase/PostgREST/network errors come back with
// different shapes — check status, code, and message text.
export function isAuthError(error: MaybeAuthError): boolean {
  if (!error) return false;
  if (error.status === 401) return true;
  if (error.code === "PGRST301") return true;
  const msg = error.message ?? "";
  return /jwt|token|auth|session|unauthorized/i.test(msg);
}

export const AUTH_EXPIRED_MESSAGE =
  "Sessionen har gått ut. Ladda om sidan eller logga in igen.";
