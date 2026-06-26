ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS valuation_margin_amount integer NOT NULL DEFAULT 40000;

ALTER TABLE public.company_settings
  DROP CONSTRAINT IF EXISTS company_settings_valuation_margin_amount_nonnegative;

ALTER TABLE public.company_settings
  ADD CONSTRAINT company_settings_valuation_margin_amount_nonnegative
  CHECK (valuation_margin_amount >= 0);

COMMENT ON COLUMN public.company_settings.valuation_margin_amount
  IS 'Fixed SEK margin deducted from the selected Blocket reference listing when calculating the customer offer.';
