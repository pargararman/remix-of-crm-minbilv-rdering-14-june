
-- Auction columns on leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS auction_closes_at timestamptz,
  ADD COLUMN IF NOT EXISTS auction_ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS winning_dealer_id uuid REFERENCES public.dealers(id);

-- Compute today/tomorrow 17:00 Europe/Stockholm
CREATE OR REPLACE FUNCTION public.compute_auction_close(_from timestamptz)
RETURNS timestamptz
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_local timestamp;
  v_today_close timestamp;
BEGIN
  v_local := (_from AT TIME ZONE 'Europe/Stockholm');
  v_today_close := date_trunc('day', v_local) + interval '17 hours';
  IF v_local < v_today_close THEN
    RETURN v_today_close AT TIME ZONE 'Europe/Stockholm';
  ELSE
    RETURN (v_today_close + interval '1 day') AT TIME ZONE 'Europe/Stockholm';
  END IF;
END;
$$;

-- Trigger: set auction_closes_at when stage transitions to 'matchad'
CREATE OR REPLACE FUNCTION public.set_auction_close_on_matchad()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.stage::text = 'matchad'
     AND (OLD.stage IS DISTINCT FROM NEW.stage)
     AND NEW.auction_closes_at IS NULL THEN
    NEW.auction_closes_at := public.compute_auction_close(now());
    NEW.auction_ended_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_auction_close ON public.leads;
CREATE TRIGGER trg_set_auction_close
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.set_auction_close_on_matchad();

-- Backfill auction_closes_at for any lead already in 'matchad' without one
UPDATE public.leads
SET auction_closes_at = public.compute_auction_close(now())
WHERE stage::text = 'matchad' AND auction_closes_at IS NULL;

-- auction_bids table
CREATE TABLE IF NOT EXISTS public.auction_bids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  dealer_id uuid NOT NULL REFERENCES public.dealers(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  amount integer NOT NULL CHECK (amount > 0),
  bid_number integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, bid_number)
);

CREATE INDEX IF NOT EXISTS auction_bids_lead_created_idx
  ON public.auction_bids(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS auction_bids_dealer_idx
  ON public.auction_bids(dealer_id);

GRANT SELECT, INSERT ON public.auction_bids TO authenticated;
GRANT ALL ON public.auction_bids TO service_role;

ALTER TABLE public.auction_bids ENABLE ROW LEVEL SECURITY;

-- Dealer can read bids on any lead they were published to
CREATE POLICY "auction_bids_dealer_read"
  ON public.auction_bids FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.lead_dealer_publications p
      WHERE p.lead_id = auction_bids.lead_id
        AND p.dealer_id = public.current_user_dealer_id()
    )
  );

-- Seller/admin read all accessible
CREATE POLICY "auction_bids_seller_read"
  ON public.auction_bids FOR SELECT
  TO authenticated
  USING (public.can_access_lead(lead_id));

-- Inserts only via RPC (place_bid); deny direct inserts by default
-- (no INSERT policy = denied)

-- place_bid RPC
CREATE OR REPLACE FUNCTION public.place_bid(_lead_id uuid, _amount integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_dealer uuid;
  v_lead public.leads%ROWTYPE;
  v_highest integer;
  v_next_num integer;
  v_now timestamptz := now();
  v_min_increment integer := 1000;
  v_soft_window interval := interval '5 minutes';
  v_extend_by interval := interval '5 minutes';
  v_new_close timestamptz;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  v_dealer := public.current_user_dealer_id();
  IF v_dealer IS NULL THEN RAISE EXCEPTION 'not_a_dealer'; END IF;

  SELECT * INTO v_lead FROM public.leads WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'lead_not_found'; END IF;

  IF v_lead.stage::text <> 'matchad' THEN
    RAISE EXCEPTION 'auction_not_open';
  END IF;
  IF v_lead.auction_closes_at IS NULL OR v_lead.auction_closes_at <= v_now THEN
    RAISE EXCEPTION 'auction_closed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.lead_dealer_publications
    WHERE lead_id = _lead_id AND dealer_id = v_dealer
  ) THEN
    RAISE EXCEPTION 'not_published_to_dealer';
  END IF;

  SELECT COALESCE(MAX(amount), 0) INTO v_highest
    FROM public.auction_bids WHERE lead_id = _lead_id;

  IF _amount < v_highest + v_min_increment THEN
    RAISE EXCEPTION 'bid_too_low: minimum %', v_highest + v_min_increment;
  END IF;

  SELECT COALESCE(MAX(bid_number), 0) + 1 INTO v_next_num
    FROM public.auction_bids WHERE lead_id = _lead_id;

  INSERT INTO public.auction_bids(lead_id, dealer_id, user_id, amount, bid_number)
  VALUES (_lead_id, v_dealer, v_user, _amount, v_next_num);

  -- Soft-close
  IF v_lead.auction_closes_at - v_now < v_soft_window THEN
    v_new_close := v_lead.auction_closes_at + v_extend_by;
    UPDATE public.leads SET auction_closes_at = v_new_close WHERE id = _lead_id;
  ELSE
    v_new_close := v_lead.auction_closes_at;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'bid_number', v_next_num,
    'amount', _amount,
    'closes_at', v_new_close
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.place_bid(uuid, integer) TO authenticated;

-- select_winning_dealer RPC
CREATE OR REPLACE FUNCTION public.select_winning_dealer(_lead_id uuid, _dealer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF NOT public.can_access_lead(_lead_id) THEN RAISE EXCEPTION 'forbidden'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.auction_bids
    WHERE lead_id = _lead_id AND dealer_id = _dealer_id
  ) THEN
    RAISE EXCEPTION 'dealer_has_no_bid';
  END IF;

  UPDATE public.leads
  SET winning_dealer_id = _dealer_id,
      auction_ended_at = COALESCE(auction_ended_at, now()),
      stage = 'bud_mottaget'
  WHERE id = _lead_id;

  INSERT INTO public.activity_timeline(lead_id, type, description, actor_id, actor_type, metadata)
  VALUES (_lead_id, 'winner_selected',
          'Vinnande handlare vald',
          v_user, 'seller',
          jsonb_build_object('dealer_id', _dealer_id));

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.select_winning_dealer(uuid, uuid) TO authenticated;

-- Sweeper: mark ended auctions
CREATE OR REPLACE FUNCTION public.sweep_ended_auctions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  UPDATE public.leads
  SET auction_ended_at = now()
  WHERE stage::text = 'matchad'
    AND auction_closes_at IS NOT NULL
    AND auction_closes_at <= now()
    AND auction_ended_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Schedule sweeper every minute
CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$
BEGIN
  PERFORM cron.unschedule('sweep-ended-auctions');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
SELECT cron.schedule('sweep-ended-auctions', '* * * * *', $$SELECT public.sweep_ended_auctions();$$);

-- Realtime publication for auction_bids + leads
ALTER PUBLICATION supabase_realtime ADD TABLE public.auction_bids;
