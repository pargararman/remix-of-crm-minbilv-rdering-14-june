-- 1. Add missing enum values (must be outside any transaction in plain ALTER TYPE)
ALTER TYPE public.lead_stage ADD VALUE IF NOT EXISTS 'snabb_vardering';
ALTER TYPE public.lead_stage ADD VALUE IF NOT EXISTS 'kontaktad';
ALTER TYPE public.lead_stage ADD VALUE IF NOT EXISTS 'matchad';
ALTER TYPE public.lead_stage ADD VALUE IF NOT EXISTS 'kund_accepterat';
ALTER TYPE public.lead_stage ADD VALUE IF NOT EXISTS 'hamtning';
ALTER TYPE public.lead_stage ADD VALUE IF NOT EXISTS 'arkiverad';

-- 2. stage_transitions table
CREATE TABLE IF NOT EXISTS public.stage_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  from_stage public.lead_stage,
  to_stage public.lead_stage NOT NULL,
  trigger_type text NOT NULL,
  actor_id uuid REFERENCES public.profiles(id),
  reason text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stage_transitions_lead ON public.stage_transitions (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stage_transitions_to_stage ON public.stage_transitions (to_stage, created_at);

ALTER TABLE public.stage_transitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY stage_transitions_access ON public.stage_transitions
  FOR ALL TO authenticated
  USING (public.can_access_lead(lead_id))
  WITH CHECK (public.can_access_lead(lead_id));

-- 3. stage_jobs table
CREATE TABLE IF NOT EXISTS public.stage_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  target_stage public.lead_stage NOT NULL,
  trigger_type text NOT NULL,
  run_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  cancelled_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  executed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_stage_jobs_pending ON public.stage_jobs (status, run_at);
CREATE INDEX IF NOT EXISTS idx_stage_jobs_lead ON public.stage_jobs (lead_id, status);

ALTER TABLE public.stage_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY stage_jobs_access ON public.stage_jobs
  FOR ALL TO authenticated
  USING (public.can_access_lead(lead_id))
  WITH CHECK (public.can_access_lead(lead_id));

-- 4. lead_score_weights on company_settings
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS lead_score_weights jsonb NOT NULL DEFAULT '{
    "low_mileage": 10,
    "high_mileage": -10,
    "recent_year": 10,
    "old_year": -10,
    "premium_brand": 5,
    "ev_or_hybrid": 10,
    "service_book_full": 10,
    "has_photos": 10,
    "metro_city": 5,
    "previous_lost_duplicate": -20,
    "tag_not_serious": -30
  }'::jsonb;

-- 5. compute_lead_score function
CREATE OR REPLACE FUNCTION public.compute_lead_score(p_lead_id uuid)
RETURNS int
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_weights jsonb;
  v_score int := 50;
  v_lead public.leads%ROWTYPE;
  v_vehicle public.vehicles%ROWTYPE;
  v_has_photos boolean;
  v_has_not_serious boolean;
  v_has_dup_lost boolean;
  v_current_year int := EXTRACT(YEAR FROM NOW());
BEGIN
  SELECT lead_score_weights INTO v_weights FROM public.company_settings LIMIT 1;
  IF v_weights IS NULL THEN
    RETURN 50;
  END IF;

  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RETURN 50;
  END IF;
  SELECT * INTO v_vehicle FROM public.vehicles WHERE lead_id = p_lead_id;

  IF v_vehicle.mileage_mil IS NOT NULL AND v_vehicle.mileage_mil < 15000 THEN
    v_score := v_score + COALESCE((v_weights->>'low_mileage')::int, 0);
  END IF;
  IF v_vehicle.mileage_mil IS NOT NULL AND v_vehicle.mileage_mil > 25000 THEN
    v_score := v_score + COALESCE((v_weights->>'high_mileage')::int, 0);
  END IF;
  IF v_vehicle.year IS NOT NULL AND v_vehicle.year >= v_current_year - 5 THEN
    v_score := v_score + COALESCE((v_weights->>'recent_year')::int, 0);
  END IF;
  IF v_vehicle.year IS NOT NULL AND v_vehicle.year <= v_current_year - 10 THEN
    v_score := v_score + COALESCE((v_weights->>'old_year')::int, 0);
  END IF;
  IF v_vehicle.brand IN ('BMW','Mercedes','Audi','Volvo','Tesla','Porsche','Lexus') THEN
    v_score := v_score + COALESCE((v_weights->>'premium_brand')::int, 0);
  END IF;
  IF v_vehicle.fuel::text IN ('electric','hybrid','plugin_hybrid') THEN
    v_score := v_score + COALESCE((v_weights->>'ev_or_hybrid')::int, 0);
  END IF;
  IF v_vehicle.service_book = 'Fullständig' THEN
    v_score := v_score + COALESCE((v_weights->>'service_book_full')::int, 0);
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.files WHERE lead_id = p_lead_id) INTO v_has_photos;
  IF v_has_photos THEN
    v_score := v_score + COALESCE((v_weights->>'has_photos')::int, 0);
  END IF;
  IF v_lead.city IN ('Stockholm','Göteborg','Malmö') THEN
    v_score := v_score + COALESCE((v_weights->>'metro_city')::int, 0);
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.leads
    WHERE (phone = v_lead.phone OR registration_number = v_lead.registration_number)
      AND stage IN ('forlorad','inget_svar')
      AND id <> p_lead_id
  ) INTO v_has_dup_lost;
  IF v_has_dup_lost THEN
    v_score := v_score + COALESCE((v_weights->>'previous_lost_duplicate')::int, 0);
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.lead_tags WHERE lead_id = p_lead_id AND tag = 'Ej seriös') INTO v_has_not_serious;
  IF v_has_not_serious THEN
    v_score := v_score + COALESCE((v_weights->>'tag_not_serious')::int, 0);
  END IF;

  RETURN GREATEST(0, LEAST(100, v_score));
END;
$$;

-- 6. Trigger to recompute on changes
CREATE OR REPLACE FUNCTION public.trigger_recompute_lead_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_id uuid;
BEGIN
  v_lead_id := COALESCE(NEW.lead_id, OLD.lead_id);
  IF v_lead_id IS NOT NULL THEN
    UPDATE public.leads SET lead_score = public.compute_lead_score(v_lead_id) WHERE id = v_lead_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS vehicles_recompute_score ON public.vehicles;
CREATE TRIGGER vehicles_recompute_score
  AFTER INSERT OR UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.trigger_recompute_lead_score();

DROP TRIGGER IF EXISTS files_recompute_score ON public.files;
CREATE TRIGGER files_recompute_score
  AFTER INSERT OR DELETE ON public.files
  FOR EACH ROW EXECUTE FUNCTION public.trigger_recompute_lead_score();

DROP TRIGGER IF EXISTS lead_tags_recompute_score ON public.lead_tags;
CREATE TRIGGER lead_tags_recompute_score
  AFTER INSERT OR DELETE ON public.lead_tags
  FOR EACH ROW EXECUTE FUNCTION public.trigger_recompute_lead_score();