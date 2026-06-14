UPDATE public.leads
SET owner_id = NULL, owned_at = NULL
WHERE owner_id IN (SELECT id FROM public.profiles WHERE role = 'admin');