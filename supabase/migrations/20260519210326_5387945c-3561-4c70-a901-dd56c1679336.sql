
ALTER TYPE public.sms_delivery_status ADD VALUE IF NOT EXISTS 'cancelled';

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS template_code text;
CREATE INDEX IF NOT EXISTS idx_messages_template_lead ON public.messages(lead_id, template_code) WHERE template_code IS NOT NULL;

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS notified_at timestamptz;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'manual';
CREATE INDEX IF NOT EXISTS idx_tasks_due_open ON public.tasks(due_date) WHERE status = 'open' AND notified_at IS NULL;
