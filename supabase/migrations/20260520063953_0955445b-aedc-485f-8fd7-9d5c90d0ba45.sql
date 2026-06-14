
CREATE TABLE public.intake_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text,
  external_id text,
  registration_number text,
  phone text,
  email text,
  status text NOT NULL,
  error_message text,
  validation_errors jsonb,
  signature_valid boolean,
  idempotency_key text,
  created_lead_id uuid,
  payload_preview jsonb,
  raw_payload_preview text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_intake_attempts_created_at ON public.intake_attempts (created_at DESC);
CREATE INDEX idx_intake_attempts_status ON public.intake_attempts (status);

ALTER TABLE public.intake_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY intake_attempts_admin_select
  ON public.intake_attempts FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
