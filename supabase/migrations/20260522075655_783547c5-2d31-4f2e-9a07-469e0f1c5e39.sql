ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS equipment_notes TEXT,
  ADD COLUMN IF NOT EXISTS extras_list TEXT[],
  ADD COLUMN IF NOT EXISTS sell_timeframe TEXT;