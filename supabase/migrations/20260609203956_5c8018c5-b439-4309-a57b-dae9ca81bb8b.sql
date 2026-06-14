DROP POLICY IF EXISTS leads_dealer_published_select ON public.leads;
CREATE POLICY leads_dealer_published_select ON public.leads
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.lead_dealer_publications p
      WHERE p.lead_id = leads.id
        AND p.dealer_id = public.current_user_dealer_id()
    )
  );

DROP POLICY IF EXISTS vehicles_dealer_published_select ON public.vehicles;
CREATE POLICY vehicles_dealer_published_select ON public.vehicles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.lead_dealer_publications p
      WHERE p.lead_id = vehicles.lead_id
        AND p.dealer_id = public.current_user_dealer_id()
    )
  );