## Vad du får

1. **Handlardetalj (/admin/dealers/[id])** — nytt **Portalkonto**-block direkt under befintliga uppgifter:
   - Lista över varje portalanvändare hos handlaren (e-post + senaste inloggning).
   - Knapparna **Skicka återställningslänk** och **Sätt nytt lösenord** per användare.
   - Befintligt fält "Bjud in användare" får ett komplement: **Skapa konto direkt** (admin sätter både e-post och startlösenord, kontot blir aktivt direkt utan mejlbekräftelse).
   - Klick på handlarkortet i listan öppnar denna sida precis som idag.

2. **Behörigheter & konton (/admin/permissions)** — samlad kontohantering för **både** säljare/admins och handlarportal-användare:
   - Kolumner: namn, e-post, roll/handlare, status, senaste inloggning.
   - Per rad: **Skicka återställning**, **Sätt nytt lösenord**.
   - Två "Skapa nytt"-knappar i toppen:
     - **+ Ny säljare/admin** — dialog med namn, e-post, roll (säljare/admin), startlösenord.
     - **+ Ny handlaranvändare** — dialog med handlare (sök/välj), e-post, startlösenord. Kopplar automatiskt till `dealer_users`.
   - Alla skapanden bekräftar e-post direkt (`email_confirm: true`), användaren kan logga in på en gång.

3. **Återställningsmejl från info@minbilvardering.se** — Lovable Emails på `minbilvardering.se` (du lägger till NS-records hos din domänleverantör). Brandade auth-templates (recovery, signup, magic-link, invite, email-change, reauthentication) i er färgprofil. Recovery-länken pekar till `https://app.minbilvardering.se/reset-password`.

## Tekniskt

**Nya server-funktioner i `src/lib/admin-accounts.functions.ts`** (alla `requireAdmin`, auditloggade, ingen lösenordstext i loggen):

- `sendPasswordResetEmail({ userId })` — hämtar e-post från `auth.admin`, kör `supabase.auth.resetPasswordForEmail(email, { redirectTo: SITE_URL + "/reset-password" })`.
- `adminSetUserPassword({ userId, password })` — Zod (min 8 tecken), `auth.admin.updateUserById`. Blockerar `userId === actorId`.
- `createStaffAccount({ name, email, role, password })` — `auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name, role } })` + upsert i `profiles` (befintlig `handle_new_user`-trigger skapar profilen, vi uppdaterar namn/roll).
- `createDealerAccount({ dealerId, email, password })` — samma sak + upsert i `dealer_users`, sätter `profiles.role = 'dealer'`.
- `listAccountOverview` — utökas att returnera handlarportal-användare i samma form som staff (namn, e-post, lastSignInAt, dealer_id, dealer_name) så samma rad-komponent kan återanvändas.

**UI**
- `src/components/admin/account-actions.tsx` — återanvändbar rad: "Skicka återställning" + "Sätt lösenord"-dialog.
- `src/components/admin/create-staff-dialog.tsx` och `create-dealer-user-dialog.tsx` — formulär med Zod-validering.
- `src/routes/_authenticated/admin/permissions.tsx` — ny kolumn **Åtgärder**, ny sektion **Handlarportalanvändare**, två "Skapa nytt"-knappar i toppen.
- `src/routes/_authenticated/admin/dealers.$dealerId.tsx` — nytt **Portalkonto**-kort som listar `dealer_users` + AccountActions + "Skapa konto direkt".

**E-post (Lovable Emails)**
1. Setup-dialog för domän `minbilvardering.se` (du gör NS-records).
2. `setup_email_infra` (queues, cron, tabeller).
3. `scaffold_auth_email_templates` → brandade `.tsx`-templates anpassade efter er färgprofil och logotyp, svensk text, `FROM_DOMAIN` visas som `info@minbilvardering.se`.
4. Verifierar att `/reset-password`-routen tar emot recovery-länken korrekt.

**Säkerhet**
- Alla nya server-fn körs via `requireAdmin`.
- `audit_logs`: `password_reset_sent`, `admin_password_set`, `staff_account_created`, `dealer_account_created` (lösenord loggas aldrig).
- Sätt-lösenord blockerar `userId === actorId` (admin måste använda reset-flödet på sig själv).
- Startlösenord skickas aldrig i mejl — admin förmedlar det manuellt till användaren.

## Inget annat ändras

- Befintliga dealer-RLS, sms-flöden, cron-jobb m.m. är orörda.
- `/reset-password`-routen och login-flödet används som de är.
- Befintlig "Bjud in via mejl"-funktion behålls vid sidan av nya "Skapa direkt".
