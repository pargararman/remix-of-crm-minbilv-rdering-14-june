-- =========================================================
-- ENUMS
-- =========================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'seller', 'dealer');
CREATE TYPE public.availability_status AS ENUM ('online', 'offline', 'away', 'sick', 'not_taking_leads');

CREATE TYPE public.lead_stage AS ENUM (
  'ny_lead', 'snabb_vardering', 'kontaktad',
  'uppfoljning_1', 'uppfoljning_2', 'uppfoljning_3', 'inget_svar',
  'matchad', 'bud_mottaget', 'kund_accepterat', 'hamtning',
  'vunnen', 'forlorad', 'arkiverad'
);

CREATE TYPE public.lead_source AS ENUM (
  'minbilvardering', 'bilbud', 'elbilvarde', 'website',
  'facebook', 'google_ads', 'tiktok', 'organic', 'referral', 'manual'
);

CREATE TYPE public.fuel_type AS ENUM (
  'bensin', 'diesel', 'hybrid', 'plugin_hybrid',
  'electric', 'gas', 'ethanol', 'other'
);
CREATE TYPE public.gearbox_type AS ENUM ('manual', 'automatic', 'unknown');

CREATE TYPE public.sms_direction AS ENUM ('inbound', 'outbound');
CREATE TYPE public.sms_delivery_status AS ENUM ('queued', 'sent', 'delivered', 'failed', 'undelivered', 'received');

CREATE TYPE public.dealer_offer_status AS ENUM ('pending', 'submitted', 'updated', 'accepted', 'rejected', 'expired');
CREATE TYPE public.task_status AS ENUM ('open', 'snoozed', 'completed', 'cancelled');
CREATE TYPE public.invoice_status AS ENUM ('not_billed', 'draft', 'sent', 'paid', 'cancelled');
CREATE TYPE public.pricing_model AS ENUM ('per_lead', 'per_won_deal', 'monthly_fee', 'custom');

CREATE TYPE public.lost_reason AS ENUM (
  'inget_svar', 'sald_privat', 'kund_angrade', 'bud_for_lagt',
  'for_dyr_kundforvantan', 'felaktiga_uppgifter', 'dubblett',
  'bilproblem', 'handlare_drog_sig_ur', 'annat'
);

CREATE TYPE public.photo_category AS ENUM (
  'framifran', 'bakifran', 'vanster_sida', 'hoger_sida',
  'interior', 'matarstallning', 'servicebok', 'skador', 'ovrigt'
);

CREATE TYPE public.note_visibility AS ENUM ('internal', 'dealer_visible');

-- =========================================================
-- UTILITY FUNCTIONS
-- =========================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =========================================================
-- COMPANY SETTINGS
-- =========================================================
CREATE TABLE public.company_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL DEFAULT 'Min Bil Värdering.se',
  brand_primary text NOT NULL DEFAULT '#7C3AED',
  default_sms_signature text,
  default_email_signature text,
  timezone text NOT NULL DEFAULT 'Europe/Stockholm',
  sms_quiet_hours_start time NOT NULL DEFAULT '21:00',
  sms_quiet_hours_end time NOT NULL DEFAULT '08:00',
  car_info_url_pattern text NOT NULL DEFAULT 'https://www.car.info/sv-se/license-plate/S/{REGNR}',
  blocket_url_pattern text,
  followup_1_hours int NOT NULL DEFAULT 24,
  followup_2_hours int NOT NULL DEFAULT 48,
  followup_3_hours int NOT NULL DEFAULT 72,
  inget_svar_hours int NOT NULL DEFAULT 24,
  auto_archive_days int NOT NULL DEFAULT 30,
  round_robin_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER company_settings_set_updated
BEFORE UPDATE ON public.company_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.company_settings (id) VALUES (gen_random_uuid());

-- =========================================================
-- PROFILES
-- =========================================================
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text,
  email text,
  phone text,
  role public.app_role NOT NULL DEFAULT 'seller',
  status text NOT NULL DEFAULT 'active',
  availability public.availability_status NOT NULL DEFAULT 'offline',
  theme_preference text NOT NULL DEFAULT 'dark',
  last_login_at timestamptz,
  last_assigned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_theme_chk CHECK (theme_preference IN ('dark','light','system'))
);

CREATE TRIGGER profiles_set_updated
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_profiles_role ON public.profiles(role);
CREATE INDEX idx_profiles_availability ON public.profiles(availability);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'seller')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================
-- ROLE HELPER (SECURITY DEFINER to avoid RLS recursion)
-- =========================================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.current_role_is(_role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), _role);
$$;

-- =========================================================
-- LEADS
-- =========================================================
CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text,
  customer_name text,
  phone text NOT NULL,
  email text NOT NULL,
  registration_number text NOT NULL,
  city text,
  region text,
  source public.lead_source NOT NULL DEFAULT 'manual',
  campaign text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  ad_id text,
  referrer text,
  stage public.lead_stage NOT NULL DEFAULT 'ny_lead',
  previous_stage public.lead_stage,
  owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  owned_at timestamptz,
  lead_score int NOT NULL DEFAULT 50,
  version int NOT NULL DEFAULT 1,
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(registration_number, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(phone, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(email, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(customer_name, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(city, '')), 'C')
  ) STORED,
  gdpr_consent boolean NOT NULL DEFAULT false,
  marketing_consent boolean NOT NULL DEFAULT false,
  consent_timestamp timestamptz,
  lost_reason_code public.lost_reason,
  lost_reason_text text,
  free_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE TRIGGER leads_set_updated
BEFORE UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_leads_phone ON public.leads(phone);
CREATE INDEX idx_leads_email ON public.leads(email);
CREATE INDEX idx_leads_regnr ON public.leads(registration_number);
CREATE INDEX idx_leads_owner_stage ON public.leads(owner_id, stage);
CREATE INDEX idx_leads_stage_activity ON public.leads(stage, last_activity_at);
CREATE INDEX idx_leads_score ON public.leads(lead_score DESC);
CREATE INDEX idx_leads_search ON public.leads USING GIN(search_vector);
CREATE INDEX idx_leads_active ON public.leads(stage) WHERE archived_at IS NULL;

-- =========================================================
-- VEHICLES
-- =========================================================
CREATE TABLE public.vehicles (
  lead_id uuid PRIMARY KEY REFERENCES public.leads(id) ON DELETE CASCADE,
  brand text,
  model text,
  version text,
  year int,
  mileage_mil int,
  fuel public.fuel_type,
  gearbox public.gearbox_type,
  body_type text,
  horsepower int,
  equipment text,
  service_book text,
  keys_count text,
  tires text,
  condition text,
  damage_notes text,
  paint_condition text,
  interior_condition text,
  smoke_free boolean,
  warning_lights boolean,
  inspection_until date,
  engine_gearbox_notes text,
  timing_belt_notes text,
  extra_equipment text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER vehicles_set_updated
BEFORE UPDATE ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_vehicles_brand_model ON public.vehicles(brand, model);

-- =========================================================
-- PRICING + HISTORY
-- =========================================================
CREATE TABLE public.pricing (
  lead_id uuid PRIMARY KEY REFERENCES public.leads(id) ON DELETE CASCADE,
  customer_expectation int,
  valuation_from int,
  valuation_to int,
  in_price int,
  out_price int,
  pricing_notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE TRIGGER pricing_set_updated
BEFORE UPDATE ON public.pricing
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.pricing_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  old_value text,
  new_value text,
  changed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pricing_history_lead ON public.pricing_history(lead_id, created_at DESC);

-- =========================================================
-- TAGS
-- =========================================================
CREATE TABLE public.lead_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  tag text NOT NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(lead_id, tag)
);

CREATE INDEX idx_lead_tags_lead ON public.lead_tags(lead_id);

-- =========================================================
-- NOTES
-- =========================================================
CREATE TABLE public.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  visibility public.note_visibility NOT NULL DEFAULT 'internal',
  content text NOT NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER notes_set_updated
BEFORE UPDATE ON public.notes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_notes_lead ON public.notes(lead_id, created_at DESC);

-- =========================================================
-- NEGOTIATION
-- =========================================================
CREATE TABLE public.negotiation_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  actor_type text NOT NULL,
  actor_id uuid,
  amount int,
  comment text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_negotiation_lead ON public.negotiation_entries(lead_id, created_at DESC);

-- =========================================================
-- TASKS
-- =========================================================
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  title text NOT NULL,
  due_date timestamptz,
  reminder_time timestamptz,
  status public.task_status NOT NULL DEFAULT 'open',
  completed_at timestamptz,
  snoozed_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tasks_owner_due ON public.tasks(owner_id, due_date) WHERE status = 'open';
CREATE INDEX idx_tasks_lead ON public.tasks(lead_id);

-- =========================================================
-- ACTIVITY TIMELINE
-- =========================================================
CREATE TABLE public.activity_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  type text NOT NULL,
  description text,
  actor_id uuid,
  actor_type text NOT NULL DEFAULT 'system',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_timeline_lead ON public.activity_timeline(lead_id, created_at DESC);

-- =========================================================
-- FILES
-- =========================================================
CREATE TABLE public.files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  file_url text,
  storage_path text NOT NULL,
  file_type text,
  category public.photo_category,
  caption text,
  thumbnail_url text,
  visible_to_dealer boolean NOT NULL DEFAULT false,
  file_size_bytes bigint,
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_files_lead ON public.files(lead_id, created_at DESC);

-- =========================================================
-- INTAKE IDEMPOTENCY
-- =========================================================
CREATE TABLE public.intake_idempotency (
  idempotency_key text PRIMARY KEY,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_intake_idemp_created ON public.intake_idempotency(created_at);

-- =========================================================
-- AUDIT LOGS
-- =========================================================
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL,
  object_type text,
  object_id uuid,
  old_value jsonb,
  new_value jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_user ON public.audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_object ON public.audit_logs(object_type, object_id);

-- =========================================================
-- NOTIFICATIONS
-- =========================================================
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user ON public.notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON public.notifications(user_id) WHERE read_at IS NULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- =========================================================
-- AUTH THROTTLE
-- =========================================================
CREATE TABLE public.auth_throttle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address inet NOT NULL,
  email text,
  failed_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz
);

CREATE INDEX idx_auth_throttle_ip ON public.auth_throttle(ip_address, failed_at DESC);

-- =========================================================
-- ENABLE RLS
-- =========================================================
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.negotiation_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intake_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_throttle ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- HELPER: can current user access this lead?
-- =========================================================
CREATE OR REPLACE FUNCTION public.can_access_lead(_lead_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = _lead_id
      AND (
        public.has_role(auth.uid(), 'admin')
        OR l.owner_id = auth.uid()
        OR l.owner_id IS NULL
      )
  );
$$;

-- =========================================================
-- RLS POLICIES
-- =========================================================

-- company_settings
CREATE POLICY cs_read ON public.company_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY cs_admin_write ON public.company_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- profiles
CREATE POLICY profiles_read ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY profiles_update_self ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND role = (SELECT role FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY profiles_admin_all ON public.profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- leads
CREATE POLICY leads_admin_all ON public.leads FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY leads_seller_select ON public.leads FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'seller')
    AND (owner_id = auth.uid() OR owner_id IS NULL)
  );
CREATE POLICY leads_seller_update ON public.leads FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'seller')
    AND (owner_id = auth.uid() OR owner_id IS NULL)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'seller')
    AND (owner_id = auth.uid() OR owner_id IS NULL)
  );
CREATE POLICY leads_seller_insert ON public.leads FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'seller'));

-- Sub-tables via can_access_lead
CREATE POLICY vehicles_access ON public.vehicles FOR ALL TO authenticated
  USING (public.can_access_lead(lead_id))
  WITH CHECK (public.can_access_lead(lead_id));

CREATE POLICY pricing_access ON public.pricing FOR ALL TO authenticated
  USING (public.can_access_lead(lead_id))
  WITH CHECK (public.can_access_lead(lead_id));

CREATE POLICY pricing_history_access ON public.pricing_history FOR ALL TO authenticated
  USING (public.can_access_lead(lead_id))
  WITH CHECK (public.can_access_lead(lead_id));

CREATE POLICY tags_access ON public.lead_tags FOR ALL TO authenticated
  USING (public.can_access_lead(lead_id))
  WITH CHECK (public.can_access_lead(lead_id));

CREATE POLICY notes_access ON public.notes FOR ALL TO authenticated
  USING (public.can_access_lead(lead_id))
  WITH CHECK (public.can_access_lead(lead_id));

CREATE POLICY negotiation_access ON public.negotiation_entries FOR ALL TO authenticated
  USING (public.can_access_lead(lead_id))
  WITH CHECK (public.can_access_lead(lead_id));

CREATE POLICY tasks_access ON public.tasks FOR ALL TO authenticated
  USING (public.can_access_lead(lead_id))
  WITH CHECK (public.can_access_lead(lead_id));

CREATE POLICY timeline_access ON public.activity_timeline FOR ALL TO authenticated
  USING (public.can_access_lead(lead_id))
  WITH CHECK (public.can_access_lead(lead_id));

CREATE POLICY files_access ON public.files FOR ALL TO authenticated
  USING (public.can_access_lead(lead_id))
  WITH CHECK (public.can_access_lead(lead_id));

-- intake idempotency: admin only via client; server uses service role
CREATE POLICY idemp_admin ON public.intake_idempotency FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- audit: admin only
CREATE POLICY audit_admin ON public.audit_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- notifications: user reads/updates own
CREATE POLICY notifications_self ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY notifications_self_update ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY notifications_admin_all ON public.notifications FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- auth throttle: admin only (server uses service role)
CREATE POLICY throttle_admin ON public.auth_throttle FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- LEAD TRIGGERS: timeline + last_activity
-- =========================================================
CREATE OR REPLACE FUNCTION public.lead_stage_change_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    NEW.previous_stage = OLD.stage;
    NEW.last_activity_at = now();
    INSERT INTO public.activity_timeline (lead_id, type, description, actor_id, actor_type, metadata)
    VALUES (
      NEW.id,
      'stage_changed',
      'Steg ändrat: ' || OLD.stage::text || ' → ' || NEW.stage::text,
      auth.uid(),
      CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'seller' END,
      jsonb_build_object('from', OLD.stage::text, 'to', NEW.stage::text)
    );
  END IF;
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    NEW.last_activity_at = now();
    INSERT INTO public.activity_timeline (lead_id, type, description, actor_id, actor_type, metadata)
    VALUES (
      NEW.id,
      CASE WHEN OLD.owner_id IS NULL THEN 'lead_claimed' ELSE 'lead_reassigned' END,
      CASE WHEN OLD.owner_id IS NULL
        THEN 'Lead övertagen'
        ELSE 'Lead omtilldelad'
      END,
      auth.uid(),
      CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'seller' END,
      jsonb_build_object('from_owner', OLD.owner_id, 'to_owner', NEW.owner_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER leads_change_trigger
BEFORE UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.lead_stage_change_trigger();