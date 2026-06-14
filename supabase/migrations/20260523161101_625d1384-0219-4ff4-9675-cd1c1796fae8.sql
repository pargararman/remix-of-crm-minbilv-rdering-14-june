ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS equipment_package text,
  ADD COLUMN IF NOT EXISTS options text[],
  ADD COLUMN IF NOT EXISTS selling_timeframe text,
  ADD COLUMN IF NOT EXISTS notes text;