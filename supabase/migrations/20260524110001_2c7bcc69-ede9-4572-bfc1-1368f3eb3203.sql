alter table public.leads
  add column if not exists submission_count integer not null default 1,
  add column if not exists last_submission_at timestamptz;

create table if not exists public.intake_submissions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  step text,
  source text,
  idempotency_key text,
  payload_preview jsonb,
  created_at timestamptz not null default now()
);

create index if not exists intake_submissions_lead_id_idx on public.intake_submissions(lead_id);
create index if not exists intake_submissions_created_at_idx on public.intake_submissions(created_at desc);

alter table public.intake_submissions enable row level security;

create policy "intake_submissions_access"
  on public.intake_submissions
  for all
  to authenticated
  using (public.can_access_lead(lead_id))
  with check (public.can_access_lead(lead_id));