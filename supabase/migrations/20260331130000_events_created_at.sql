alter table public.events
  add column if not exists created_at timestamptz default now();

update public.events
set created_at = coalesce(created_at, now())
where created_at is null;
