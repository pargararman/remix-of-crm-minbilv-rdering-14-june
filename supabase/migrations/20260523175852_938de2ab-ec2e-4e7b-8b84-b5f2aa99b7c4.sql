ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS equipment_notes text,
  ADD COLUMN IF NOT EXISTS image_urls text[];

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS customer_expectation text,
  ADD COLUMN IF NOT EXISTS selling_timeframe text;