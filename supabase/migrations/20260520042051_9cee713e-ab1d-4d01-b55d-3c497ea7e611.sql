
-- Extensions for geo-distance
CREATE EXTENSION IF NOT EXISTS cube;
CREATE EXTENSION IF NOT EXISTS earthdistance;

-- cities cache for geocoding
CREATE TABLE public.cities (
  name text PRIMARY KEY,
  display_name text,
  region text,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  geocoded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;
CREATE POLICY cities_read_all ON public.cities FOR SELECT TO authenticated USING (true);
CREATE POLICY cities_admin_write ON public.cities FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- dealers
CREATE TABLE public.dealers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  org_number text,
  contact_person text,
  email text NOT NULL UNIQUE,
  phone text,
  address text,
  postal_code text,
  city text NOT NULL,
  region text,
  latitude double precision,
  longitude double precision,
  buying_radius_km int NOT NULL DEFAULT 50,
  preferred_brands text[] NOT NULL DEFAULT '{}',
  preferred_vehicle_types text[] NOT NULL DEFAULT '{}',
  preferred_fuels public.fuel_type[] NOT NULL DEFAULT '{}',
  max_mileage_mil int,
  min_year int,
  price_range_from int,
  price_range_to int,
  notify_via_email boolean NOT NULL DEFAULT true,
  notify_via_sms boolean NOT NULL DEFAULT false,
  notify_only_preferred_brands boolean NOT NULL DEFAULT false,
  notify_only_within_radius boolean NOT NULL DEFAULT true,
  pricing_model public.pricing_model NOT NULL DEFAULT 'per_lead',
  price_per_lead int,
  price_per_won_deal int,
  monthly_fee int,
  custom_terms text,
  status text NOT NULL DEFAULT 'active',
  internal_notes text,
  reliability_score numeric(3,1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz
);
CREATE INDEX dealers_status_idx ON public.dealers (status);
CREATE INDEX dealers_region_idx ON public.dealers (region);
CREATE INDEX dealers_city_idx ON public.dealers (city);
CREATE INDEX dealers_last_active_idx ON public.dealers (last_active_at DESC);
CREATE INDEX dealers_geo_idx ON public.dealers
  USING gist (ll_to_earth(latitude, longitude))
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE TRIGGER dealers_set_updated_at
  BEFORE UPDATE ON public.dealers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.dealers ENABLE ROW LEVEL SECURITY;

-- dealer_users
CREATE TABLE public.dealer_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  dealer_id uuid NOT NULL REFERENCES public.dealers(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);
CREATE INDEX dealer_users_dealer_idx ON public.dealer_users (dealer_id);
ALTER TABLE public.dealer_users ENABLE ROW LEVEL SECURITY;

-- security definer helper to avoid RLS recursion
CREATE OR REPLACE FUNCTION public.current_user_dealer_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT dealer_id FROM public.dealer_users WHERE user_id = auth.uid() LIMIT 1;
$$;

-- dealers RLS
CREATE POLICY dealers_admin_all ON public.dealers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY dealers_self_read ON public.dealers FOR SELECT TO authenticated
  USING (id = public.current_user_dealer_id());

-- dealer_users RLS
CREATE POLICY dealer_users_admin_all ON public.dealer_users FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY dealer_users_self_read ON public.dealer_users FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- leads geocoding cols
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS longitude double precision;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS pickup_location text;

-- lead_dealer_publications
CREATE TABLE public.lead_dealer_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  dealer_id uuid NOT NULL REFERENCES public.dealers(id) ON DELETE CASCADE,
  published_by uuid REFERENCES public.profiles(id),
  match_score int,
  match_reasons text[] NOT NULL DEFAULT '{}',
  share_photos boolean NOT NULL DEFAULT true,
  share_city boolean NOT NULL DEFAULT true,
  include_pricing_range boolean NOT NULL DEFAULT true,
  dealer_comment text,
  notified_at timestamptz,
  first_viewed_at timestamptz,
  view_count int NOT NULL DEFAULT 0,
  interest_marked_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, dealer_id)
);
CREATE INDEX ldp_dealer_created_idx ON public.lead_dealer_publications (dealer_id, created_at DESC);
CREATE INDEX ldp_lead_idx ON public.lead_dealer_publications (lead_id);
ALTER TABLE public.lead_dealer_publications ENABLE ROW LEVEL SECURITY;

CREATE POLICY ldp_admin_all ON public.lead_dealer_publications FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY ldp_seller_own_leads ON public.lead_dealer_publications FOR SELECT TO authenticated
  USING (public.can_access_lead(lead_id));
CREATE POLICY ldp_seller_insert ON public.lead_dealer_publications FOR INSERT TO authenticated
  WITH CHECK (public.can_access_lead(lead_id));
CREATE POLICY ldp_seller_delete ON public.lead_dealer_publications FOR DELETE TO authenticated
  USING (public.can_access_lead(lead_id));
CREATE POLICY ldp_dealer_own ON public.lead_dealer_publications FOR SELECT TO authenticated
  USING (dealer_id = public.current_user_dealer_id());

-- dealer_notifications
CREATE TABLE public.dealer_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id uuid NOT NULL REFERENCES public.dealers(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  channel text NOT NULL,
  status text NOT NULL DEFAULT 'sent',
  external_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dealer_notifications_dealer_idx ON public.dealer_notifications (dealer_id, created_at DESC);
ALTER TABLE public.dealer_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY dn_admin_all ON public.dealer_notifications FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY dn_dealer_self ON public.dealer_notifications FOR SELECT TO authenticated
  USING (dealer_id = public.current_user_dealer_id());
