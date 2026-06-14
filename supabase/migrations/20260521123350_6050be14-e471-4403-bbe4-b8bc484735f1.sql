
-- Realtime för messages-tabellen
ALTER TABLE public.messages REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.messages';
  END IF;
END $$;

-- Pin för konversationer (visas högst upp i SMS-inkorg)
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS pin_inbox_at timestamptz NULL;
CREATE INDEX IF NOT EXISTS idx_leads_pin_inbox_at ON public.leads (pin_inbox_at DESC) WHERE pin_inbox_at IS NOT NULL;
