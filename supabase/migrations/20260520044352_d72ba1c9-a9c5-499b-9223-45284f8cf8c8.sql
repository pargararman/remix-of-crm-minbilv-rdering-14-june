
REVOKE ALL ON public.lead_sla_metrics FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_lead_sla_metrics() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_monthly_dealer_fees() FROM PUBLIC, anon, authenticated;
