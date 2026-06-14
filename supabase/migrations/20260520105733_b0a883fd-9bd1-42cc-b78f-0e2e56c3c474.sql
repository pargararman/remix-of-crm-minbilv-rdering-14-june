
-- Pausa triggers som anropar compute_lead_score (cachar fuel-enum)
DROP TRIGGER IF EXISTS vehicles_recompute_score ON public.vehicles;
DROP TRIGGER IF EXISTS files_recompute_score ON public.files;
DROP TRIGGER IF EXISTS lead_tags_recompute_score ON public.lead_tags;

-- 1. FUEL
CREATE TYPE fuel_type_new AS ENUM (
  'bensin','diesel','el','etanol','fordonsgas',
  'hybrid_bensin','hybrid_diesel','hybrid_gas',
  'plugin_bensin','plugin_diesel','okant'
);
ALTER TABLE public.vehicles ADD COLUMN fuel_new fuel_type_new;
UPDATE public.vehicles SET fuel_new = (CASE fuel::text
  WHEN 'petrol' THEN 'bensin' WHEN 'diesel' THEN 'diesel'
  WHEN 'electric' THEN 'el' WHEN 'ethanol' THEN 'etanol'
  WHEN 'gas' THEN 'fordonsgas' WHEN 'hybrid' THEN 'hybrid_bensin'
  WHEN 'plugin_hybrid' THEN 'plugin_bensin' WHEN 'other' THEN 'okant'
  ELSE 'okant' END)::fuel_type_new WHERE fuel IS NOT NULL;
ALTER TABLE public.vehicles DROP COLUMN fuel;
ALTER TABLE public.vehicles RENAME COLUMN fuel_new TO fuel;

ALTER TABLE public.dealers ALTER COLUMN preferred_fuels DROP DEFAULT;
ALTER TABLE public.dealers ALTER COLUMN preferred_fuels TYPE text[] USING preferred_fuels::text[];
UPDATE public.dealers SET preferred_fuels = ARRAY(
  SELECT CASE x
    WHEN 'petrol' THEN 'bensin' WHEN 'electric' THEN 'el'
    WHEN 'ethanol' THEN 'etanol' WHEN 'gas' THEN 'fordonsgas'
    WHEN 'hybrid' THEN 'hybrid_bensin' WHEN 'plugin_hybrid' THEN 'plugin_bensin'
    WHEN 'other' THEN 'okant' ELSE x END FROM unnest(preferred_fuels) AS x);
DROP TYPE IF EXISTS public.fuel_type;
ALTER TYPE public.fuel_type_new RENAME TO fuel_type;
ALTER TABLE public.dealers ALTER COLUMN preferred_fuels TYPE public.fuel_type[]
  USING preferred_fuels::public.fuel_type[];
ALTER TABLE public.dealers ALTER COLUMN preferred_fuels SET DEFAULT '{}'::public.fuel_type[];

ALTER TABLE public.vehicles ADD COLUMN fuel_needs_review boolean NOT NULL DEFAULT false;
UPDATE public.vehicles SET fuel_needs_review = true WHERE fuel IN ('hybrid_bensin','plugin_bensin');

-- 2. BODY TYPE
CREATE TYPE public.body_type AS ENUM (
  'cabriolet','coupe','familjebuss','halvkombi_3d','halvkombi_5d',
  'kombi','pickup','sedan','skapbil','suv','annat','okant');
ALTER TABLE public.vehicles ADD COLUMN body_type_new public.body_type;
UPDATE public.vehicles SET body_type_new = (CASE LOWER(COALESCE(body_type,''))
  WHEN 'cab' THEN 'cabriolet' WHEN 'cabriolet' THEN 'cabriolet'
  WHEN 'coupe' THEN 'coupe' WHEN 'coupé' THEN 'coupe'
  WHEN 'familjebuss' THEN 'familjebuss'
  WHEN 'halvkombi' THEN 'halvkombi_5d'
  WHEN 'halvkombi_5d' THEN 'halvkombi_5d' WHEN 'halvkombi_3d' THEN 'halvkombi_3d'
  WHEN 'kombi' THEN 'kombi' WHEN 'pickup' THEN 'pickup'
  WHEN 'sedan' THEN 'sedan' WHEN 'skåpbil' THEN 'skapbil' WHEN 'skapbil' THEN 'skapbil'
  WHEN 'suv' THEN 'suv' WHEN 'transporter' THEN 'skapbil'
  WHEN 'annat' THEN 'annat' WHEN '' THEN 'okant' ELSE 'okant'
END)::public.body_type WHERE body_type IS NOT NULL;
ALTER TABLE public.vehicles DROP COLUMN body_type;
ALTER TABLE public.vehicles RENAME COLUMN body_type_new TO body_type;
ALTER TABLE public.vehicles ADD COLUMN body_type_needs_review boolean NOT NULL DEFAULT false;
UPDATE public.vehicles SET body_type_needs_review = true WHERE body_type = 'halvkombi_5d';

-- 3. GEARBOX
CREATE TYPE public.gearbox_type_new AS ENUM ('automatisk','manuell','sekventiell','okant');
ALTER TABLE public.vehicles ADD COLUMN gearbox_new public.gearbox_type_new;
UPDATE public.vehicles SET gearbox_new = (CASE gearbox::text
  WHEN 'manual' THEN 'manuell' WHEN 'manuell' THEN 'manuell'
  WHEN 'automatic' THEN 'automatisk' WHEN 'automat' THEN 'automatisk' WHEN 'automatisk' THEN 'automatisk'
  WHEN 'sequential' THEN 'sekventiell' WHEN 'sekventiell' THEN 'sekventiell'
  WHEN 'unknown' THEN 'okant' ELSE 'okant'
END)::public.gearbox_type_new WHERE gearbox IS NOT NULL;
ALTER TABLE public.vehicles DROP COLUMN gearbox;
ALTER TABLE public.vehicles RENAME COLUMN gearbox_new TO gearbox;
DROP TYPE IF EXISTS public.gearbox_type;
ALTER TYPE public.gearbox_type_new RENAME TO gearbox_type;

-- 4. DRIVE TYPE
CREATE TYPE public.drive_type AS ENUM (
  'bakhjulsdrift','framhjulsdrift','fyrhjulsdrift','tvahjulsdriven','okant');
ALTER TABLE public.vehicles ADD COLUMN drive_type public.drive_type;
UPDATE public.vehicles SET drive_type = (CASE LOWER(COALESCE(drivetrain,''))
  WHEN 'front' THEN 'framhjulsdrift' WHEN 'framhjulsdrift' THEN 'framhjulsdrift' WHEN 'fwd' THEN 'framhjulsdrift'
  WHEN 'rear' THEN 'bakhjulsdrift' WHEN 'bakhjulsdrift' THEN 'bakhjulsdrift' WHEN 'rwd' THEN 'bakhjulsdrift'
  WHEN 'all' THEN 'fyrhjulsdrift' WHEN 'fyrhjulsdrift' THEN 'fyrhjulsdrift'
  WHEN 'awd' THEN 'fyrhjulsdrift' WHEN '4wd' THEN 'fyrhjulsdrift' WHEN '4x4' THEN 'fyrhjulsdrift'
  WHEN '2wd' THEN 'tvahjulsdriven' WHEN 'tvahjulsdrift' THEN 'tvahjulsdriven' WHEN 'tvahjulsdriven' THEN 'tvahjulsdriven'
  ELSE NULL END)::public.drive_type;
ALTER TABLE public.vehicles DROP COLUMN drivetrain;

-- 5. company_settings: biluppgifter pattern
ALTER TABLE public.company_settings
  ADD COLUMN biluppgifter_url_pattern text NOT NULL DEFAULT 'https://biluppgifter.se/fordon/{REGNR}';

-- 6. Uppdaterad lead-score-funktion
CREATE OR REPLACE FUNCTION public.compute_lead_score(p_lead_id uuid)
 RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_weights jsonb; v_score int := 50;
  v_lead public.leads%ROWTYPE; v_vehicle public.vehicles%ROWTYPE;
  v_has_photos boolean; v_has_not_serious boolean; v_has_dup_lost boolean;
  v_current_year int := EXTRACT(YEAR FROM NOW());
BEGIN
  SELECT lead_score_weights INTO v_weights FROM public.company_settings LIMIT 1;
  IF v_weights IS NULL THEN RETURN 50; END IF;
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN RETURN 50; END IF;
  SELECT * INTO v_vehicle FROM public.vehicles WHERE lead_id = p_lead_id;

  IF v_vehicle.mileage_mil IS NOT NULL AND v_vehicle.mileage_mil < 15000 THEN
    v_score := v_score + COALESCE((v_weights->>'low_mileage')::int, 0); END IF;
  IF v_vehicle.mileage_mil IS NOT NULL AND v_vehicle.mileage_mil > 25000 THEN
    v_score := v_score + COALESCE((v_weights->>'high_mileage')::int, 0); END IF;
  IF v_vehicle.year IS NOT NULL AND v_vehicle.year >= v_current_year - 5 THEN
    v_score := v_score + COALESCE((v_weights->>'recent_year')::int, 0); END IF;
  IF v_vehicle.year IS NOT NULL AND v_vehicle.year <= v_current_year - 10 THEN
    v_score := v_score + COALESCE((v_weights->>'old_year')::int, 0); END IF;
  IF v_vehicle.brand IN ('BMW','Mercedes','Audi','Volvo','Tesla','Porsche','Lexus') THEN
    v_score := v_score + COALESCE((v_weights->>'premium_brand')::int, 0); END IF;
  IF v_vehicle.fuel::text IN ('el','hybrid_bensin','hybrid_diesel','hybrid_gas','plugin_bensin','plugin_diesel') THEN
    v_score := v_score + COALESCE((v_weights->>'ev_or_hybrid')::int, 0); END IF;
  IF v_vehicle.service_book = 'Fullständig' THEN
    v_score := v_score + COALESCE((v_weights->>'service_book_full')::int, 0); END IF;

  SELECT EXISTS(SELECT 1 FROM public.files WHERE lead_id = p_lead_id) INTO v_has_photos;
  IF v_has_photos THEN v_score := v_score + COALESCE((v_weights->>'has_photos')::int, 0); END IF;
  IF v_lead.city IN ('Stockholm','Göteborg','Malmö') THEN
    v_score := v_score + COALESCE((v_weights->>'metro_city')::int, 0); END IF;

  SELECT EXISTS(SELECT 1 FROM public.leads
    WHERE (phone = v_lead.phone OR registration_number = v_lead.registration_number)
      AND stage IN ('forlorad','inget_svar') AND id <> p_lead_id) INTO v_has_dup_lost;
  IF v_has_dup_lost THEN v_score := v_score + COALESCE((v_weights->>'previous_lost_duplicate')::int, 0); END IF;
  SELECT EXISTS(SELECT 1 FROM public.lead_tags WHERE lead_id = p_lead_id AND tag = 'Ej seriös') INTO v_has_not_serious;
  IF v_has_not_serious THEN v_score := v_score + COALESCE((v_weights->>'tag_not_serious')::int, 0); END IF;

  RETURN GREATEST(0, LEAST(100, v_score));
END;
$function$;

-- Återskapa triggers
CREATE TRIGGER vehicles_recompute_score AFTER INSERT OR UPDATE OR DELETE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.trigger_recompute_lead_score();
CREATE TRIGGER files_recompute_score AFTER INSERT OR DELETE ON public.files
  FOR EACH ROW EXECUTE FUNCTION public.trigger_recompute_lead_score();
CREATE TRIGGER lead_tags_recompute_score AFTER INSERT OR DELETE ON public.lead_tags
  FOR EACH ROW EXECUTE FUNCTION public.trigger_recompute_lead_score();
