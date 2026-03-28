create table if not exists public.event_sources (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  record_id uuid not null references public.records (id) on delete cascade,
  notes text,
  created_at timestamptz not null default now(),
  unique (event_id, record_id)
);

create index if not exists event_sources_event_id_idx on public.event_sources (event_id);
create index if not exists event_sources_record_id_idx on public.event_sources (record_id);

alter table public.event_sources enable row level security;

create policy "event_sources_select_own"
  on public.event_sources for select
  using (
    exists (
      select 1 from public.events e
      where e.id = event_sources.event_id
        and e.user_id = auth.uid()
    )
  );

create policy "event_sources_insert_own"
  on public.event_sources for insert
  with check (
    exists (
      select 1 from public.events e
      where e.id = event_sources.event_id
        and e.user_id = auth.uid()
    )
    and exists (
      select 1 from public.records r
      where r.id = event_sources.record_id
        and r.user_id = auth.uid()
    )
  );

create policy "event_sources_update_own"
  on public.event_sources for update
  using (
    exists (
      select 1 from public.events e
      where e.id = event_sources.event_id
        and e.user_id = auth.uid()
    )
  );

create policy "event_sources_delete_own"
  on public.event_sources for delete
  using (
    exists (
      select 1 from public.events e
      where e.id = event_sources.event_id
        and e.user_id = auth.uid()
    )
  );
