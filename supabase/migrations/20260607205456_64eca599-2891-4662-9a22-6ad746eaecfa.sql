
CREATE OR REPLACE FUNCTION public.auto_publish_to_all_dealers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.stage::text = 'matchad'
     AND (TG_OP = 'INSERT' OR OLD.stage IS DISTINCT FROM NEW.stage) THEN
    INSERT INTO public.lead_dealer_publications
      (lead_id, dealer_id, published_by, share_photos, share_city, include_pricing_range)
    SELECT NEW.id, d.id, NEW.owner_id, true, true, false
    FROM public.dealers d
    WHERE d.status = 'active'
    ON CONFLICT (lead_id, dealer_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_auto_publish_to_all_dealers ON public.leads;
CREATE TRIGGER trg_auto_publish_to_all_dealers
AFTER INSERT OR UPDATE OF stage ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.auto_publish_to_all_dealers();

-- Backfill existing matchad leads
INSERT INTO public.lead_dealer_publications
  (lead_id, dealer_id, share_photos, share_city, include_pricing_range)
SELECT l.id, d.id, true, true, false
FROM public.leads l
CROSS JOIN public.dealers d
WHERE l.stage::text = 'matchad' AND d.status = 'active'
ON CONFLICT (lead_id, dealer_id) DO NOTHING;
