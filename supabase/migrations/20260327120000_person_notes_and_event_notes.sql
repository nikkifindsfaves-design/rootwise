-- Per-user research notes on a person profile
create table if not exists public.person_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  person_id uuid not null references public.persons (id) on delete cascade,
  content text not null default '',
  updated_at timestamptz not null default now(),
  unique (user_id, person_id)
);

create index if not exists person_notes_user_id_idx on public.person_notes (user_id);

alter table public.events
  add column if not exists notes text;

alter table public.person_notes enable row level security;

create policy "person_notes_select_own"
  on public.person_notes for select
  using (auth.uid() = user_id);

create policy "person_notes_insert_own"
  on public.person_notes for insert
  with check (auth.uid() = user_id);

create policy "person_notes_update_own"
  on public.person_notes for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "person_notes_delete_own"
  on public.person_notes for delete
  using (auth.uid() = user_id);
