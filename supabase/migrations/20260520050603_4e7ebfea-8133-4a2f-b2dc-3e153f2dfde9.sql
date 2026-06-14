-- GDPR requests
CREATE TABLE IF NOT EXISTS public.gdpr_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type text NOT NULL CHECK (request_type IN ('access','deletion','rectification')),
  customer_phone text,
  customer_email text,
  matched_lead_ids uuid[] DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processed','rejected')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processed_by uuid,
  export_file_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.gdpr_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY gdpr_admin_all ON public.gdpr_requests FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_gdpr_updated BEFORE UPDATE ON public.gdpr_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Retention jobs
CREATE TABLE IF NOT EXISTS public.retention_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL,
  target_lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  run_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  executed_at timestamptz,
  result text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_retention_pending ON public.retention_jobs (status, run_at);
ALTER TABLE public.retention_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY retention_admin_all ON public.retention_jobs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- User notification settings
CREATE TABLE IF NOT EXISTS public.user_notification_settings (
  user_id uuid PRIMARY KEY,
  email_enabled jsonb NOT NULL DEFAULT '{}'::jsonb,
  sms_enabled jsonb NOT NULL DEFAULT '{}'::jsonb,
  browser_enabled jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_notification_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY uns_own ON public.user_notification_settings FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Lead access logs (separate from audit_logs for volume)
CREATE TABLE IF NOT EXISTS public.lead_access_logs (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  accessed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lal_lead ON public.lead_access_logs (lead_id, accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_lal_user ON public.lead_access_logs (user_id, accessed_at DESC);
ALTER TABLE public.lead_access_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY lal_admin_select ON public.lead_access_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY lal_self_select ON public.lead_access_logs FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY lal_self_insert ON public.lead_access_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Extend company_settings with retention
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS retention_lost_months int NOT NULL DEFAULT 24;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS retention_archive_months int NOT NULL DEFAULT 36;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS daily_backup_enabled boolean NOT NULL DEFAULT false;

-- Extend notifications with metadata if missing
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Backups storage bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('backups','backups',false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "backups_admin_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'backups' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "backups_admin_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'backups' AND public.has_role(auth.uid(),'admin'));