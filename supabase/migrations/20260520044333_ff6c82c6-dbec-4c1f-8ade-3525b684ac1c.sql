
-- ========== FAS 5.1: SLA, Rapporter & Fakturering ==========

-- 1) Invoice status enum
DO $$ BEGIN
  CREATE TYPE invoice_status AS ENUM ('not_billed','draft','sent','paid','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Minimal dealer_offers & won_deals (om de saknas från Fas 4.2)
CREATE TABLE IF NOT EXISTS public.dealer_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  dealer_id uuid NOT NULL,
  amount integer NOT NULL,
  comment text,
  status text NOT NULL DEFAULT 'active',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dealer_offers_lead ON public.dealer_offers(lead_id);
CREATE INDEX IF NOT EXISTS idx_dealer_offers_dealer ON public.dealer_offers(dealer_id);
ALTER TABLE public.dealer_offers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS do_admin_all ON public.dealer_offers;
CREATE POLICY do_admin_all ON public.dealer_offers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS do_seller_lead ON public.dealer_offers;
CREATE POLICY do_seller_lead ON public.dealer_offers FOR SELECT TO authenticated
  USING (public.can_access_lead(lead_id));
DROP POLICY IF EXISTS do_dealer_own ON public.dealer_offers;
CREATE POLICY do_dealer_own ON public.dealer_offers FOR SELECT TO authenticated
  USING (dealer_id = public.current_user_dealer_id());

CREATE TABLE IF NOT EXISTS public.won_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL UNIQUE,
  dealer_id uuid NOT NULL,
  final_price integer NOT NULL,
  won_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE INDEX IF NOT EXISTS idx_won_deals_dealer ON public.won_deals(dealer_id);
ALTER TABLE public.won_deals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wd_admin_all ON public.won_deals;
CREATE POLICY wd_admin_all ON public.won_deals FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS wd_seller_lead ON public.won_deals;
CREATE POLICY wd_seller_lead ON public.won_deals FOR SELECT TO authenticated
  USING (public.can_access_lead(lead_id));
DROP POLICY IF EXISTS wd_dealer_own ON public.won_deals;
CREATE POLICY wd_dealer_own ON public.won_deals FOR SELECT TO authenticated
  USING (dealer_id = public.current_user_dealer_id());

CREATE TABLE IF NOT EXISTS public.dealer_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id uuid NOT NULL,
  user_id uuid,
  type text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dealer_activity_dealer ON public.dealer_activity(dealer_id, created_at);
ALTER TABLE public.dealer_activity ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS da_admin_all ON public.dealer_activity;
CREATE POLICY da_admin_all ON public.dealer_activity FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS da_dealer_own ON public.dealer_activity;
CREATE POLICY da_dealer_own ON public.dealer_activity FOR SELECT TO authenticated
  USING (dealer_id = public.current_user_dealer_id());

-- 3) billing_logs
CREATE TABLE IF NOT EXISTS public.billing_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id uuid NOT NULL REFERENCES public.dealers(id) ON DELETE RESTRICT,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  billing_type pricing_model NOT NULL,
  amount integer NOT NULL DEFAULT 0,
  description text,
  event_type text NOT NULL,
  assigned_at timestamptz,
  won_at timestamptz,
  invoice_status invoice_status NOT NULL DEFAULT 'not_billed',
  invoice_period_month text,
  marked_invoiced_at timestamptz,
  marked_invoiced_by uuid REFERENCES public.profiles(id),
  invoice_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_billing_logs_dealer_period ON public.billing_logs(dealer_id, invoice_period_month);
CREATE INDEX IF NOT EXISTS idx_billing_logs_status ON public.billing_logs(invoice_status);
CREATE INDEX IF NOT EXISTS idx_billing_logs_lead ON public.billing_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_billing_logs_event ON public.billing_logs(event_type, created_at);

ALTER TABLE public.billing_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS billing_admin_all ON public.billing_logs;
CREATE POLICY billing_admin_all ON public.billing_logs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS billing_dealer_self_read ON public.billing_logs;
CREATE POLICY billing_dealer_self_read ON public.billing_logs FOR SELECT TO authenticated
  USING (dealer_id = public.current_user_dealer_id());

DROP TRIGGER IF EXISTS trg_billing_updated_at ON public.billing_logs;
CREATE TRIGGER trg_billing_updated_at BEFORE UPDATE ON public.billing_logs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) company_settings — SLA & moms
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS sla_targets jsonb NOT NULL DEFAULT '{
    "first_auto_sms_min": 1,
    "first_manual_touch_min": 30,
    "first_valuation_min": 120,
    "first_bid_hours": 24,
    "customer_accepted_hours": 48,
    "pickup_hours": 168
  }'::jsonb,
  ADD COLUMN IF NOT EXISTS vat_rate integer NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS company_address text,
  ADD COLUMN IF NOT EXISTS org_number text,
  ADD COLUMN IF NOT EXISTS bank_details text;

-- 5) Materialized view för SLA-metrics
DROP MATERIALIZED VIEW IF EXISTS public.lead_sla_metrics;
CREATE MATERIALIZED VIEW public.lead_sla_metrics AS
SELECT
  l.id AS lead_id,
  l.created_at,
  l.owner_id,
  l.source,
  l.stage,
  l.region,
  l.city,
  v.brand,
  (SELECT EXTRACT(EPOCH FROM (MIN(m.created_at) - l.created_at))/60
     FROM public.messages m
    WHERE m.lead_id = l.id AND m.direction='outbound' AND m.sender_id IS NULL) AS t_first_auto_sms_min,
  EXTRACT(EPOCH FROM (
    LEAST(
      (SELECT MIN(m.created_at) FROM public.messages m
        WHERE m.lead_id = l.id AND m.direction='outbound' AND m.sender_id IS NOT NULL),
      (SELECT MIN(c.created_at) FROM public.call_logs c WHERE c.lead_id = l.id)
    ) - l.created_at
  ))/60 AS t_first_manual_touch_min,
  EXTRACT(EPOCH FROM (
    (SELECT MIN(ph.created_at) FROM public.pricing_history ph
       WHERE ph.lead_id = l.id AND ph.field_name IN ('valuation_from','valuation_to'))
    - l.created_at
  ))/60 AS t_first_valuation_min,
  EXTRACT(EPOCH FROM (
    (SELECT MIN(m.created_at) FROM public.messages m
       WHERE m.lead_id = l.id AND m.direction='inbound')
    - l.created_at
  ))/60 AS t_first_reply_min,
  EXTRACT(EPOCH FROM (
    (SELECT MIN(ldp.created_at) FROM public.lead_dealer_publications ldp
       WHERE ldp.lead_id = l.id)
    - l.created_at
  ))/3600 AS t_dealer_match_hours,
  EXTRACT(EPOCH FROM (
    (SELECT MIN(o.created_at) FROM public.dealer_offers o WHERE o.lead_id = l.id)
    - l.created_at
  ))/3600 AS t_first_bid_hours,
  EXTRACT(EPOCH FROM (
    (SELECT MIN(st.created_at) FROM public.stage_transitions st
       WHERE st.lead_id = l.id AND st.to_stage = 'kund_accepterat')
    - l.created_at
  ))/3600 AS t_customer_accepted_hours,
  EXTRACT(EPOCH FROM (
    (SELECT MIN(st.created_at) FROM public.stage_transitions st
       WHERE st.lead_id = l.id AND st.to_stage = 'hamtning')
    - l.created_at
  ))/3600 AS t_pickup_hours,
  EXTRACT(EPOCH FROM (
    (SELECT MIN(st.created_at) FROM public.stage_transitions st
       WHERE st.lead_id = l.id AND st.to_stage = 'vunnen')
    - l.created_at
  ))/3600 AS t_won_hours
FROM public.leads l
LEFT JOIN public.vehicles v ON v.lead_id = l.id;

CREATE UNIQUE INDEX IF NOT EXISTS lead_sla_metrics_pk ON public.lead_sla_metrics(lead_id);
CREATE INDEX IF NOT EXISTS idx_sla_owner_created ON public.lead_sla_metrics(owner_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sla_source_created ON public.lead_sla_metrics(source, created_at);

-- 6) Functions
CREATE OR REPLACE FUNCTION public.refresh_lead_sla_metrics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.lead_sla_metrics;
EXCEPTION WHEN OTHERS THEN
  REFRESH MATERIALIZED VIEW public.lead_sla_metrics;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_monthly_dealer_fees()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period text := to_char(NOW() - interval '1 day','YYYY-MM');
  v_count int := 0;
BEGIN
  INSERT INTO public.billing_logs (dealer_id, billing_type, amount, event_type, description, invoice_period_month)
  SELECT id, 'monthly_fee'::pricing_model, COALESCE(monthly_fee,0), 'monthly_access',
         'Månadsavgift för ' || v_period, v_period
  FROM public.dealers
  WHERE pricing_model = 'monthly_fee'
    AND status = 'active'
    AND COALESCE(monthly_fee,0) > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.billing_logs b
      WHERE b.dealer_id = dealers.id
        AND b.event_type = 'monthly_access'
        AND b.invoice_period_month = v_period
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 7) Invoices storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices','invoices', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS invoices_admin_all ON storage.objects;
CREATE POLICY invoices_admin_all ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'invoices' AND public.has_role(auth.uid(),'admin'))
  WITH CHECK (bucket_id = 'invoices' AND public.has_role(auth.uid(),'admin'));
