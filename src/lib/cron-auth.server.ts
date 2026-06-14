// Autentisering för cron-/hook-endpoints under /api/public/hooks/*.
// Dessa var tidigare helt öppna — vem som helst kunde trigga SMS-utskick
// och stegjobb. Nu krävs en delad hemlighet i headern `x-cron-secret`.
//
// Konfiguration: sätt CRON_HOOK_SECRET i miljön OCH skicka samma värde i
// headern från schemaläggaren (Cloudflare cron / extern pinger).
// Fail-safe: saknas hemligheten i miljön svarar vi 503 i stället för att
// köra oskyddat.
export function verifyCronAuth(request: Request): Response | null {
  const secret = process.env.CRON_HOOK_SECRET;
  if (!secret) {
    console.error("[cron-auth] CRON_HOOK_SECRET saknas i miljön — hook blockerad (fail-safe)");
    return Response.json(
      { error: "CRON_HOOK_SECRET ej konfigurerad" },
      { status: 503 },
    );
  }
  const provided = request.headers.get("x-cron-secret");
  if (!provided || provided !== secret) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
