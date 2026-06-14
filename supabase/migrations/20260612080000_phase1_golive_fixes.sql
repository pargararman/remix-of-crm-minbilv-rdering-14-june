-- =====================================================================
-- Fas 1 go-live-fixar (2026-06-12)
-- 1. Beslut A: ta bort auto-publicering till alla handlare — endast
--    kurerad publicering via publishLeadToDealers gäller.
-- 2. Stäng PII-läckan: handlare ska INTE kunna läsa leads/vehicles
--    direkt via PostgREST. All handlardata går via serverfunktioner
--    som returnerar anonymiserade DTO:er.
-- 3. Nya inställningskolumner för uppföljnings-SMS och handlarnotiser.
-- 4. Stage-enum: komplettera matrisen med kontrakt_pagar_avtal (finns
--    redan i enum sedan 20260520084258 — ingen enum-ändring behövs).
-- =====================================================================

-- 1. Bort med auto-publish-triggern (Beslut A)
DROP TRIGGER IF EXISTS trg_auto_publish_to_all_dealers ON public.leads;
DROP FUNCTION IF EXISTS public.auto_publish_to_all_dealers();

-- 2. Bort med handlarnas direkta radläsning på leads/vehicles.
--    OBS: handlarportalens serverfunktioner använder admin-klienten efter
--    explicit publikationskontroll, så portalen påverkas inte.
--    auction_bids-policyn (auction_bids_dealer_read) behålls — den
--    innehåller ingen PII och driver realtidsuppdateringar i budvyn.
DROP POLICY IF EXISTS leads_dealer_published_select ON public.leads;
DROP POLICY IF EXISTS vehicles_dealer_published_select ON public.vehicles;

-- 3a. Central på/av-knapp + per-stegs-aktivering för uppföljnings-SMS.
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS followups_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS followup_1_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS followup_2_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS followup_3_enabled boolean NOT NULL DEFAULT true;

-- 3b. Notisinställningar per handlare för överbud och vunnen auktion.
ALTER TABLE public.dealers
  ADD COLUMN IF NOT EXISTS notify_on_outbid boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_on_won boolean NOT NULL DEFAULT true;

-- 4. Billing-idempotens: förhindra dubbeldebitering på DB-nivå för
--    obetalda per_lead/per_won_deal-rader. Befintliga dubbletter (om
--    några) rensas först — vi behåller den äldsta raden per nyckel.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY lead_id, dealer_id, billing_type
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM public.billing_logs
  WHERE billing_type IN ('per_lead', 'per_won_deal')
    AND invoice_status = 'not_billed'
)
DELETE FROM public.billing_logs b
USING ranked r
WHERE b.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS billing_logs_unique_lead_dealer_type
  ON public.billing_logs(lead_id, dealer_id, billing_type)
  WHERE billing_type IN ('per_lead', 'per_won_deal');
