CREATE OR REPLACE FUNCTION public.save_pricing(p_lead_id uuid, p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_allowed text[] := ARRAY[
    'valuation_from','valuation_to',
    'in_price_from','in_price_to',
    'out_price_from','out_price_to',
    'customer_expectation','pricing_notes'
  ];
  v_label jsonb := jsonb_build_object(
    'valuation_from','Värdering från','valuation_to','Värdering till',
    'in_price_from','Inpris från','in_price_to','Inpris till',
    'out_price_from','Utpris från','out_price_to','Utpris till',
    'customer_expectation','Kundens förväntan','pricing_notes','Priskommentar'
  );
  v_existing public.pricing%ROWTYPE;
  v_clean jsonb := '{}'::jsonb;
  v_field text;
  v_result public.pricing;
  v_old_val text;
  v_new_val text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  IF NOT public.can_access_lead(p_lead_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  FOREACH v_field IN ARRAY v_allowed LOOP
    IF p_patch ? v_field THEN
      v_clean := v_clean || jsonb_build_object(v_field, p_patch -> v_field);
    END IF;
  END LOOP;

  IF v_clean = '{}'::jsonb THEN
    SELECT * INTO v_result FROM public.pricing WHERE lead_id = p_lead_id;
    RETURN jsonb_build_object('pricing', to_jsonb(v_result));
  END IF;

  SELECT * INTO v_existing FROM public.pricing WHERE lead_id = p_lead_id;

  IF v_clean ? 'in_price_from' THEN
    v_clean := v_clean || jsonb_build_object('in_price', v_clean -> 'in_price_from');
  END IF;
  IF v_clean ? 'out_price_from' THEN
    v_clean := v_clean || jsonb_build_object('out_price', v_clean -> 'out_price_from');
  END IF;

  INSERT INTO public.pricing AS p (
    lead_id, updated_by, updated_at,
    valuation_from, valuation_to,
    in_price_from, in_price_to,
    out_price_from, out_price_to,
    customer_expectation, pricing_notes,
    in_price, out_price
  )
  VALUES (
    p_lead_id, v_user, now(),
    NULLIF(v_clean->>'valuation_from','')::int,
    NULLIF(v_clean->>'valuation_to','')::int,
    NULLIF(v_clean->>'in_price_from','')::int,
    NULLIF(v_clean->>'in_price_to','')::int,
    NULLIF(v_clean->>'out_price_from','')::int,
    NULLIF(v_clean->>'out_price_to','')::int,
    NULLIF(v_clean->>'customer_expectation','')::int,
    v_clean->>'pricing_notes',
    NULLIF(v_clean->>'in_price','')::int,
    NULLIF(v_clean->>'out_price','')::int
  )
  ON CONFLICT (lead_id) DO UPDATE SET
    valuation_from = CASE WHEN v_clean ? 'valuation_from' THEN NULLIF(v_clean->>'valuation_from','')::int ELSE p.valuation_from END,
    valuation_to = CASE WHEN v_clean ? 'valuation_to' THEN NULLIF(v_clean->>'valuation_to','')::int ELSE p.valuation_to END,
    in_price_from = CASE WHEN v_clean ? 'in_price_from' THEN NULLIF(v_clean->>'in_price_from','')::int ELSE p.in_price_from END,
    in_price_to = CASE WHEN v_clean ? 'in_price_to' THEN NULLIF(v_clean->>'in_price_to','')::int ELSE p.in_price_to END,
    out_price_from = CASE WHEN v_clean ? 'out_price_from' THEN NULLIF(v_clean->>'out_price_from','')::int ELSE p.out_price_from END,
    out_price_to = CASE WHEN v_clean ? 'out_price_to' THEN NULLIF(v_clean->>'out_price_to','')::int ELSE p.out_price_to END,
    customer_expectation = CASE WHEN v_clean ? 'customer_expectation' THEN NULLIF(v_clean->>'customer_expectation','')::int ELSE p.customer_expectation END,
    pricing_notes = CASE WHEN v_clean ? 'pricing_notes' THEN v_clean->>'pricing_notes' ELSE p.pricing_notes END,
    in_price = CASE WHEN v_clean ? 'in_price' THEN NULLIF(v_clean->>'in_price','')::int ELSE p.in_price END,
    out_price = CASE WHEN v_clean ? 'out_price' THEN NULLIF(v_clean->>'out_price','')::int ELSE p.out_price END,
    updated_by = v_user,
    updated_at = now()
  RETURNING * INTO v_result;

  FOREACH v_field IN ARRAY v_allowed LOOP
    IF NOT (v_clean ? v_field) THEN CONTINUE; END IF;
    v_new_val := v_clean ->> v_field;
    v_old_val := CASE
      WHEN v_existing.lead_id IS NULL THEN NULL
      ELSE (to_jsonb(v_existing) ->> v_field)
    END;
    IF COALESCE(v_old_val,'') IS DISTINCT FROM COALESCE(v_new_val,'') THEN
      INSERT INTO public.pricing_history(lead_id, field_name, old_value, new_value, changed_by)
      VALUES (p_lead_id, v_field, v_old_val, v_new_val, v_user);
      INSERT INTO public.activity_timeline(lead_id, type, description, actor_id, actor_type, metadata)
      VALUES (p_lead_id, 'price_updated',
              'Pris uppdaterat: ' || (v_label->>v_field) || ' ' ||
                COALESCE(v_old_val,'(tom)') || ' → ' || COALESCE(v_new_val,'(tom)'),
              v_user, 'seller',
              jsonb_build_object('field', v_field, 'old', v_old_val, 'new', v_new_val));
    END IF;
  END LOOP;

  UPDATE public.leads SET last_activity_at = now() WHERE id = p_lead_id;

  RETURN jsonb_build_object('pricing', to_jsonb(v_result));
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_pricing(uuid, jsonb) TO authenticated;