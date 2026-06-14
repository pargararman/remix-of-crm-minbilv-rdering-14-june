
-- Vehicle assessment extra fields
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS urgency text,
  ADD COLUMN IF NOT EXISTS dealer_feedback text,
  ADD COLUMN IF NOT EXISTS summer_tires_notes text,
  ADD COLUMN IF NOT EXISTS winter_tires_notes text,
  ADD COLUMN IF NOT EXISTS last_service_date date,
  ADD COLUMN IF NOT EXISTS last_service_notes text;

-- Files extra fields
ALTER TABLE public.files
  ADD COLUMN IF NOT EXISTS width int,
  ADD COLUMN IF NOT EXISTS height int,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Tasks extra fields
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS completed_by uuid,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS tasks_set_updated_at ON public.tasks;
CREATE TRIGGER tasks_set_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tasks_owner_status_due ON public.tasks (owner_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_lead ON public.tasks (lead_id);
CREATE INDEX IF NOT EXISTS idx_files_lead_created ON public.files (lead_id, created_at DESC);

-- Storage buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('lead-photos', 'lead-photos', false, 10485760, ARRAY['image/jpeg','image/png','image/webp','image/heic']),
  ('lead-documents', 'lead-documents', false, 20971520, ARRAY['application/pdf','image/jpeg','image/png','image/webp','image/heic'])
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types,
      public = EXCLUDED.public;

-- Helper: extract lead_id from path
CREATE OR REPLACE FUNCTION public.storage_lead_id(_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF((string_to_array(_name, '/'))[1], '')::uuid;
$$;

-- Storage RLS policies for both buckets
DROP POLICY IF EXISTS "lead_storage_select" ON storage.objects;
CREATE POLICY "lead_storage_select" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id IN ('lead-photos','lead-documents')
    AND public.can_access_lead(public.storage_lead_id(name))
  );

DROP POLICY IF EXISTS "lead_storage_insert" ON storage.objects;
CREATE POLICY "lead_storage_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('lead-photos','lead-documents')
    AND public.can_access_lead(public.storage_lead_id(name))
  );

DROP POLICY IF EXISTS "lead_storage_update" ON storage.objects;
CREATE POLICY "lead_storage_update" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id IN ('lead-photos','lead-documents')
    AND public.can_access_lead(public.storage_lead_id(name))
  );

DROP POLICY IF EXISTS "lead_storage_delete" ON storage.objects;
CREATE POLICY "lead_storage_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id IN ('lead-photos','lead-documents')
    AND public.can_access_lead(public.storage_lead_id(name))
  );
