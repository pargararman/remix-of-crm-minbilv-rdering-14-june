//
// Direct browser-side save for vehicle + pricing via RAW PostgREST fetch.
//
// This deliberately does NOT use the supabase-js data client. Every supabase-js
// request awaits supabase.auth.getSession() internally, and that call can hang
// for many seconds on the GoTrue LockManager after a tab regains focus — which
// is the real root cause of the save-spins-forever / save-times-out bug.
// .abortSignal() does NOT help there: it only aborts the fetch, not the token
// acquisition that happens before the fetch.
//
// Instead we read a cached token (kept fresh by onAuthStateChange in
// access-token.ts) and hit the REST endpoints directly with fetch + an
// AbortSignal. No getSession, no getUser, no lock, no useServerFn, no React
// Query. The caller owns the hard wall-clock timeout via Promise.race.
import { getAccessTokenSync } from "@/integrations/supabase/access-token";

// Read env at call time (not module-load) so values are resolved when the save
// actually runs. Vite still statically replaces these references at build time.
function supabaseUrl(): string {
  return (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
}
function supabaseAnonKey(): string {
  return (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? "";
}

export type SaveLeadValuationParams = {
  leadId: string;
  vehiclePatch?: Record<string, unknown>;
  pricingPatch?: Record<string, unknown>;
  signal: AbortSignal;
};

export type SaveResult = {
  vehicle?: Record<string, unknown> | null;
  pricing?: Record<string, unknown> | null;
};

export class RestError extends Error {
  status: number;
  code: string | null;
  constructor(status: number, message: string, code?: string | null) {
    super(message);
    this.name = "RestError";
    this.status = status;
    this.code = code ?? null;
  }
}

export function isAuthLikeError(
  error:
    | { status?: number | null; code?: string | null; message?: string | null }
    | null
    | undefined,
): boolean {
  if (!error) return false;
  if (error.status === 401) return true;
  if (error.code === "PGRST301") return true;
  return /jwt|token|auth|session|unauthorized|permission/i.test(error.message ?? "");
}

function baseHeaders(): Record<string, string> {
  const token = getAccessTokenSync();
  const anon = supabaseAnonKey();
  return {
    "Content-Type": "application/json",
    apikey: anon,
    // Fall back to the anon key only so the request still resolves (and fails
    // fast with 401) instead of hanging if no token is cached yet.
    Authorization: `Bearer ${token ?? anon}`,
  };
}

async function toRestError(res: Response): Promise<RestError> {
  let message = `HTTP ${res.status}`;
  let code: string | null = null;
  try {
    const body = await res.json();
    if (body?.message) message = body.message;
    if (body?.code) code = body.code;
  } catch {
    /* non-JSON error body */
  }
  return new RestError(res.status, message, code);
}

export async function saveLeadValuation(params: SaveLeadValuationParams): Promise<SaveResult> {
  const { leadId, vehiclePatch, pricingPatch, signal } = params;

  const baseUrl = supabaseUrl();
  if (!baseUrl || !supabaseAnonKey()) {
    throw new Error(
      "Saknar Supabase-konfiguration (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY).",
    );
  }

  const hasVehicle = vehiclePatch && Object.keys(vehiclePatch).length > 0;
  const hasPricing = pricingPatch && Object.keys(pricingPatch).length > 0;
  if (!hasVehicle && !hasPricing) return {};

  const result: SaveResult = {};

  if (hasVehicle) {
    const clean: Record<string, unknown> = { lead_id: leadId };
    for (const [k, v] of Object.entries(vehiclePatch!)) clean[k] = v ?? null;

    console.debug("[lead-valuation-save] vehicle before upsert", { ts: Date.now(), leadId });

    const res = await fetch(`${baseUrl}/rest/v1/vehicles?on_conflict=lead_id&select=*`, {
      method: "POST",
      headers: { ...baseHeaders(), Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(clean),
      signal,
    });

    console.debug("[lead-valuation-save] vehicle after upsert", {
      ts: Date.now(),
      leadId,
      ok: res.ok,
      status: res.status,
    });

    if (!res.ok) throw await toRestError(res);

    const json = await res.json();
    result.vehicle = Array.isArray(json) ? (json[0] ?? null) : (json ?? null);

    // Strict fire-and-forget timeline. NO signal (must not be aborted by the
    // save timeout), no await, can never throw into the main save.
    void fetch(`${baseUrl}/rest/v1/activity_timeline`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({
        lead_id: leadId,
        type: "vehicle_assessment_updated",
        description: `Bedömning uppdaterad: ${Object.keys(vehiclePatch!).join(", ")}`,
        actor_type: "seller",
        metadata: { fields: Object.keys(vehiclePatch!) },
      }),
    }).catch((e) => console.warn("[lead-valuation-save] timeline insert failed", e));
  }

  if (hasPricing) {
    console.debug("[lead-valuation-save] pricing before rpc", { ts: Date.now(), leadId });

    const res = await fetch(`${baseUrl}/rest/v1/rpc/save_pricing`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({ p_lead_id: leadId, p_patch: pricingPatch }),
      signal,
    });

    console.debug("[lead-valuation-save] pricing after rpc", {
      ts: Date.now(),
      leadId,
      ok: res.ok,
      status: res.status,
    });

    if (!res.ok) throw await toRestError(res);

    // RPC returns jsonb shaped as { pricing: row }.
    const data = (await res.json()) as { pricing?: Record<string, unknown> | null } | null;
    result.pricing = data?.pricing ?? null;
  }

  return result;
}
