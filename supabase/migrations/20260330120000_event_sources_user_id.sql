-- Ownership column for event_sources (required on every insert)

alter table public.event_sources
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

update public.event_sources es
set user_id = e.user_id
from public.events e
where es.event_id = e.id
  and es.user_id is null;

alter table public.event_sources
  alter column user_id set not null;

create index if not exists event_sources_user_id_idx on public.event_sources (user_id);

drop policy if exists "event_sources_select_own" on public.event_sources;
drop policy if exists "event_sources_insert_own" on public.event_sources;
drop policy if exists "event_sources_update_own" on public.event_sources;
drop policy if exists "event_sources_delete_own" on public.event_sources;

create policy "event_sources_select_own"
  on public.event_sources for select
  using (user_id = auth.uid());

create policy "event_sources_insert_own"
  on public.event_sources for insert
  with check (
    user_id = auth.uid()
    and exists (
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
  using (user_id = auth.uid());

create policy "event_sources_delete_own"
  on public.event_sources for delete
  using (user_id = auth.uid());
