
-- 1) Broaden seller policy so any seller can update leads (e.g. reassign owner).
DROP POLICY IF EXISTS "leads_seller_update" ON public.leads;
DROP POLICY IF EXISTS "leads_seller_select" ON public.leads;

CREATE POLICY "leads_seller_select"
ON public.leads
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'seller'::app_role));

CREATE POLICY "leads_seller_update"
ON public.leads
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'seller'::app_role))
WITH CHECK (has_role(auth.uid(), 'seller'::app_role));

-- 2) Active deal checklist (decoupled from stage).
CREATE TABLE IF NOT EXISTS public.lead_active_deal_checklist (
  lead_id uuid PRIMARY KEY,
  bud_mottaget boolean NOT NULL DEFAULT false,
  kund_kontaktad boolean NOT NULL DEFAULT false,
  bud_accepterat boolean NOT NULL DEFAULT false,
  hamtning_bokad boolean NOT NULL DEFAULT false,
  hamtning_genomford boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.lead_active_deal_checklist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS adc_access ON public.lead_active_deal_checklist;
CREATE POLICY adc_access
ON public.lead_active_deal_checklist
FOR ALL
TO authenticated
USING (can_access_lead(lead_id))
WITH CHECK (can_access_lead(lead_id));

CREATE TRIGGER adc_set_updated_at
BEFORE UPDATE ON public.lead_active_deal_checklist
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
