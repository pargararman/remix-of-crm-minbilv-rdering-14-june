
-- 1. Restrict inbound_orphan_messages reads to admin/seller
DROP POLICY IF EXISTS orphan_read ON public.inbound_orphan_messages;
CREATE POLICY orphan_read_staff ON public.inbound_orphan_messages
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'seller'));

-- 2. Restrict profiles reads — dealers should not see staff contact info
DROP POLICY IF EXISTS profiles_read ON public.profiles;
CREATE POLICY profiles_read_staff ON public.profiles
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'seller')
    OR id = auth.uid()
  );

-- 3. Restrict email_log NULL-lead access to admin only
DROP POLICY IF EXISTS email_log_access ON public.email_log;
CREATE POLICY email_log_access ON public.email_log
  FOR ALL TO authenticated
  USING (
    (lead_id IS NOT NULL AND public.can_access_lead(lead_id))
    OR (lead_id IS NULL AND public.has_role(auth.uid(), 'admin'))
  )
  WITH CHECK (
    (lead_id IS NOT NULL AND public.can_access_lead(lead_id))
    OR (lead_id IS NULL AND public.has_role(auth.uid(), 'admin'))
  );
