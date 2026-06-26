UPDATE public.sms_templates
SET body_sv = 'Hej {KUNDNAMN}! {VARDERING_TEXT}

Vill du att vi går vidare och försöker hitta ett konkret bud?

minbilvardering.se'
WHERE code = 'offer_range';
