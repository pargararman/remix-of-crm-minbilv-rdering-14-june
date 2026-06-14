CREATE OR REPLACE FUNCTION public.can_access_lead(_lead_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = _lead_id
      AND (
        public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'seller')
      )
  );
$$;

DROP POLICY IF EXISTS leads_seller_select ON public.leads;
DROP POLICY IF EXISTS leads_seller_update ON public.leads;

CREATE POLICY leads_team_select ON public.leads FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'seller')
  );

CREATE POLICY leads_team_update ON public.leads FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'seller')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'seller')
  );