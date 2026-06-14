
-- 1. Avatar URL + light-mode default
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.profiles ALTER COLUMN theme_preference SET DEFAULT 'light';

-- 2. Profile avatars bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-avatars', 'profile-avatars', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'profile-avatars');

DROP POLICY IF EXISTS "avatars_user_write" ON storage.objects;
CREATE POLICY "avatars_user_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'profile-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars_user_update" ON storage.objects;
CREATE POLICY "avatars_user_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'profile-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars_user_delete" ON storage.objects;
CREATE POLICY "avatars_user_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'profile-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 3. SMS template rewrites
UPDATE public.sms_templates SET body_sv = 'Hej! Tack för att du skickade in uppgifter om din bil.

Vi har tagit emot din förfrågan och återkommer inom kort.

Om du vill kan du svara direkt på detta SMS med mer information om bilen, till exempel skick, servicehistorik, däck, nycklar eller bilder.

minbilvardering.se' WHERE code = 'intake_auto';

UPDATE public.sms_templates SET body_sv = 'Hej! Ville bara följa upp angående bilen du skickade in. Vi hjälper gärna vidare om du fortfarande funderar på att sälja.

minbilvardering.se' WHERE code = 'followup_1';

UPDATE public.sms_templates SET body_sv = 'Hej igen! Ville bara höra om du fortfarande är intresserad av att sälja bilen. Vi kan fortfarande hjälpa dig vidare med värdering och bud.

minbilvardering.se' WHERE code = 'followup_2';

UPDATE public.sms_templates SET body_sv = 'Hej! Vi avslutar snart din förfrågan, men om du fortfarande vill sälja bilen är du varmt välkommen att svara på detta SMS.

minbilvardering.se' WHERE code = 'followup_3';

UPDATE public.sms_templates SET body_sv = 'Hej! Vi har nu gjort en första bedömning av bilen och tror att den kan ligga omkring {VARDERING_FRAN} - {VARDERING_TILL} kr beroende på skick, utrustning och servicehistorik.

Vill du att vi går vidare och försöker hitta ett konkret bud?

minbilvardering.se' WHERE code = 'offer_range';

UPDATE public.sms_templates SET body_sv = 'Hej! Vi har nu fått ett bud på {SUMMA} kr för bilen. Vad tänker du kring det?

minbilvardering.se' WHERE code = 'dealer_offer';

UPDATE public.sms_templates SET body_sv = 'Hej! Kan du gärna skicka några bilder på bilen? Gärna framifrån, bakifrån, från sidorna, interiör, mätarställning och eventuella skador.

minbilvardering.se' WHERE code = 'ask_photos';

UPDATE public.sms_templates SET body_sv = 'Hej! Jag försökte precis nå dig angående bilen du skickade in. Svara gärna här när det passar att bli kontaktad.

minbilvardering.se' WHERE code = 'missed_call';

UPDATE public.sms_templates SET body_sv = 'Hej! Vad hade du själv tänkt dig för pris för bilen?

minbilvardering.se' WHERE code = 'ask_price';

UPDATE public.sms_templates SET body_sv = 'Hej! Om vi kan ordna ett bud på cirka {SUMMA} kr, hade du varit öppen för att sälja bilen då?

minbilvardering.se' WHERE code = 'close_offer';

UPDATE public.sms_templates SET body_sv = 'Tack så mycket! Återkommer snart.

minbilvardering.se' WHERE code = 'quick_thanks';

UPDATE public.sms_templates SET body_sv = 'Hej! Skulle gå bra om du ringer mig så pratar vi snabbt igenom bilen?

minbilvardering.se' WHERE code = 'call_me';

UPDATE public.sms_templates SET body_sv = 'Hej! Hur tänker du — ska vi gå vidare och försöka hitta ett konkret bud till dig?

minbilvardering.se' WHERE code = 'ask_proceed';

UPDATE public.sms_templates SET body_sv = 'Hej! Vad tänker du kring detta?

minbilvardering.se' WHERE code = 'what_think';

-- 4. Default signature
UPDATE public.company_settings SET default_sms_signature = 'minbilvardering.se';
