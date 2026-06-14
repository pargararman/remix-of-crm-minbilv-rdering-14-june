
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  direction public.sms_direction NOT NULL,
  sender_id uuid REFERENCES public.profiles(id),
  from_phone text,
  to_phone text,
  body text NOT NULL,
  twilio_message_sid text UNIQUE,
  delivery_status public.sms_delivery_status NOT NULL DEFAULT 'queued',
  delivery_error text,
  send_at timestamptz,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_lead_created ON public.messages (lead_id, created_at DESC);
CREATE INDEX idx_messages_sid ON public.messages (twilio_message_sid);
CREATE INDEX idx_messages_queued ON public.messages (delivery_status, send_at) WHERE send_at IS NOT NULL;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY messages_access ON public.messages FOR ALL TO authenticated
  USING (public.can_access_lead(lead_id)) WITH CHECK (public.can_access_lead(lead_id));

CREATE TABLE public.call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES public.profiles(id),
  outcome text NOT NULL,
  summary text,
  next_contact_at timestamptz,
  duration_seconds int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_call_logs_lead_created ON public.call_logs (lead_id, created_at DESC);
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY call_logs_access ON public.call_logs FOR ALL TO authenticated
  USING (public.can_access_lead(lead_id)) WITH CHECK (public.can_access_lead(lead_id));

CREATE TABLE public.sms_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  label_sv text NOT NULL,
  body_sv text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sms_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY sms_templates_read ON public.sms_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY sms_templates_admin_write ON public.sms_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.inbound_orphan_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  twilio_message_sid text UNIQUE,
  from_phone text NOT NULL,
  body text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  assigned_to_lead_id uuid REFERENCES public.leads(id),
  assigned_by uuid REFERENCES public.profiles(id),
  assigned_at timestamptz,
  ignored boolean NOT NULL DEFAULT false
);
ALTER TABLE public.inbound_orphan_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY orphan_read ON public.inbound_orphan_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY orphan_admin_write ON public.inbound_orphan_messages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY orphan_seller_assign ON public.inbound_orphan_messages FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'seller')) WITH CHECK (public.has_role(auth.uid(), 'seller'));

CREATE TABLE public.email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  template_code text,
  to_email text,
  subject text,
  body text,
  provider_id text,
  status text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY email_log_access ON public.email_log FOR ALL TO authenticated
  USING (lead_id IS NULL OR public.can_access_lead(lead_id))
  WITH CHECK (lead_id IS NULL OR public.can_access_lead(lead_id));

INSERT INTO public.sms_templates (code, label_sv, body_sv) VALUES
('intake_auto', 'Auto: Välkomstmeddelande',
'Hej! Tack för att du skickade in uppgifter om din bil.

Vi har tagit emot din förfrågan och återkommer inom kort.

Om du vill kan du svara direkt på detta SMS med mer information om bilen, till exempel skick, servicehistorik, däck, nycklar eller bilder.

Med vänliga hälsningar
Min Bil Värdering.se'),
('followup_1', 'Uppföljning 1',
'Hej! Ville bara följa upp angående bilen du skickade in. Vi hjälper gärna vidare om du fortfarande funderar på att sälja.

— Min Bil Värdering.se'),
('followup_2', 'Uppföljning 2',
'Hej igen! Ville bara höra om du fortfarande är intresserad av att sälja bilen. Vi kan fortfarande hjälpa dig vidare med värdering och bud.

— Min Bil Värdering.se'),
('followup_3', 'Uppföljning 3',
'Hej! Vi avslutar snart din förfrågan, men om du fortfarande vill sälja bilen är du varmt välkommen att svara på detta SMS.

— Min Bil Värdering.se'),
('offer_range', 'Värderingsintervall',
'Hej! Vi har nu gjort en första bedömning av bilen och tror att den kan ligga omkring {VARDERING_FRAN} - {VARDERING_TILL} kr beroende på skick, utrustning och servicehistorik.

Vill du att vi går vidare och försöker hitta ett konkret bud?

— Min Bil Värdering.se'),
('dealer_offer', 'Bud från handlare',
'Hej! Vi har nu fått ett bud på {SUMMA} kr för bilen. Vad tänker du kring det?

— Min Bil Värdering.se'),
('ask_photos', 'Be om bilder',
'Hej! Kan du gärna skicka några bilder på bilen? Gärna framifrån, bakifrån, från sidorna, interiör, mätarställning och eventuella skador.

— Min Bil Värdering.se'),
('missed_call', 'Missat samtal',
'Hej! Jag försökte precis nå dig angående bilen du skickade in. Svara gärna här när det passar att bli kontaktad.

— Min Bil Värdering.se'),
('ask_price', 'Fråga om prisförväntan',
'Hej! Vad hade du själv tänkt dig för pris för bilen?

— Min Bil Värdering.se'),
('close_offer', 'Stäng affär',
'Hej! Om vi kan ordna ett bud på cirka {SUMMA} kr, hade du varit öppen för att sälja bilen då?

— Min Bil Värdering.se'),
('quick_thanks', 'Snabbt tack',
'Tack så mycket! Återkommer snart.

— Min Bil Värdering.se'),
('call_me', 'Be kunden ringa',
'Hej! Skulle gå bra om du ringer mig så pratar vi snabbt igenom bilen?

— Min Bil Värdering.se'),
('ask_proceed', 'Fråga om att gå vidare',
'Hej! Hur tänker du — ska vi gå vidare och försöka hitta ett konkret bud till dig?

— Min Bil Värdering.se'),
('what_think', 'Vad tänker du',
'Hej! Vad tänker du kring detta?

— Min Bil Värdering.se');
