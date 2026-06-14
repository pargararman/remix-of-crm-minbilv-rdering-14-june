ALTER TABLE public.pricing
  ADD COLUMN IF NOT EXISTS in_price_from integer,
  ADD COLUMN IF NOT EXISTS in_price_to integer,
  ADD COLUMN IF NOT EXISTS out_price_from integer,
  ADD COLUMN IF NOT EXISTS out_price_to integer;

-- Initiera nya spann från befintliga enskilda värden om de finns.
UPDATE public.pricing SET in_price_from = in_price WHERE in_price IS NOT NULL AND in_price_from IS NULL;
UPDATE public.pricing SET in_price_to = in_price WHERE in_price IS NOT NULL AND in_price_to IS NULL;
UPDATE public.pricing SET out_price_from = out_price WHERE out_price IS NOT NULL AND out_price_from IS NULL;
UPDATE public.pricing SET out_price_to = out_price WHERE out_price IS NOT NULL AND out_price_to IS NULL;