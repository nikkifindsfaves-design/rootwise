-- Queue unmatched/ambiguous places for manual review.
create table if not exists public.place_review_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  record_id uuid references public.records (id) on delete set null,
  source_type text not null default 'manual'
    check (source_type in ('birth_place', 'death_place', 'event_place', 'manual')),
  source_entity_id uuid,
  raw_input text not null,
  parsed_township text,
  parsed_county text,
  parsed_state text,
  parsed_country text,
  normalized_township text,
  normalized_county text,
  normalized_state text,
  normalized_country text,
  match_strategy text,
  match_confidence numeric(5,4),
  status text not null default 'needs_review'
    check (status in ('needs_review', 'approved', 'rejected')),
  resolved_place_id uuid references public.places (id) on delete set null,
  review_notes text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists place_review_queue_user_status_idx
  on public.place_review_queue (user_id, status);

create index if not exists place_review_queue_status_created_idx
  on public.place_review_queue (status, created_at desc);

create index if not exists place_review_queue_record_idx
  on public.place_review_queue (record_id)
  where record_id is not null;

create index if not exists place_review_queue_resolved_place_idx
  on public.place_review_queue (resolved_place_id)
  where resolved_place_id is not null;

create or replace function public.set_place_review_queue_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_place_review_queue_updated_at on public.place_review_queue;
create trigger trg_place_review_queue_updated_at
before update on public.place_review_queue
for each row
execute function public.set_place_review_queue_updated_at();

alter table public.place_review_queue enable row level security;

drop policy if exists "place_review_queue_select_own" on public.place_review_queue;
create policy "place_review_queue_select_own"
  on public.place_review_queue for select
  using (auth.uid() = user_id);

drop policy if exists "place_review_queue_insert_own" on public.place_review_queue;
create policy "place_review_queue_insert_own"
  on public.place_review_queue for insert
  with check (auth.uid() = user_id);

drop policy if exists "place_review_queue_update_own" on public.place_review_queue;
create policy "place_review_queue_update_own"
  on public.place_review_queue for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "place_review_queue_delete_own" on public.place_review_queue;
create policy "place_review_queue_delete_own"
  on public.place_review_queue for delete
  using (auth.uid() = user_id);
