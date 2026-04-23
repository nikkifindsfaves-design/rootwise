-- Two-table historical places model:
-- 1) place_identities = stable place identity
-- 2) places = historical place versions

create table if not exists public.place_identities (
  id uuid primary key default gen_random_uuid(),
  country text not null default '',
  canonical_township text,
  canonical_county text,
  canonical_state text,
  canonical_display_name text not null default '',
  created_at timestamptz not null default now()
);

alter table public.places
  add column if not exists place_identity_id uuid references public.place_identities (id) on delete cascade,
  add column if not exists valid_from date,
  add column if not exists valid_to date,
  add column if not exists historical_context text,
  add column if not exists is_canonical_current boolean not null default false,
  add column if not exists source_dataset text,
  add column if not exists source_ref text,
  add column if not exists created_at timestamptz not null default now();

-- Date window guard for historical versions.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'places_valid_range_chk'
      and conrelid = 'public.places'::regclass
  ) then
    alter table public.places
      add constraint places_valid_range_chk
      check (valid_from is null or valid_to is null or valid_from <= valid_to);
  end if;
end $$;

create index if not exists places_place_identity_id_idx
  on public.places (place_identity_id);

create index if not exists places_location_lookup_idx
  on public.places (country, state, county, township);

create index if not exists places_valid_window_idx
  on public.places (valid_from, valid_to);

create unique index if not exists places_one_current_canonical_per_identity_idx
  on public.places (place_identity_id)
  where is_canonical_current = true;

-- Backfill 1:1 identities from existing places rows.
with inserted as (
  insert into public.place_identities (
    country,
    canonical_township,
    canonical_county,
    canonical_state,
    canonical_display_name
  )
  select
    p.country,
    p.township,
    p.county,
    p.state,
    concat_ws(', ', p.township, p.county, p.state, p.country)
  from public.places p
  where p.place_identity_id is null
  returning id, country, canonical_township, canonical_county, canonical_state, canonical_display_name
)
update public.places p
set
  place_identity_id = i.id,
  is_canonical_current = true,
  valid_to = null
from inserted i
where p.place_identity_id is null
  and p.country = i.country
  and p.township is not distinct from i.canonical_township
  and p.county is not distinct from i.canonical_county
  and p.state is not distinct from i.canonical_state
  and concat_ws(', ', p.township, p.county, p.state, p.country) = i.canonical_display_name;

-- Safety pass for any row not captured by strict string match above.
update public.places
set is_canonical_current = true
where place_identity_id is not null
  and is_canonical_current = false
  and valid_to is null;

alter table public.places
  alter column place_identity_id set not null;

-- Date-aware resolver for place version lookup by identity.
create or replace function public.resolve_place_version_id(
  p_place_identity_id uuid,
  p_event_date date default null
)
returns uuid
language sql
stable
as $$
  select p.id
  from public.places p
  where p.place_identity_id = p_place_identity_id
    and (
      p_event_date is null
      or (
        (p.valid_from is null or p.valid_from <= p_event_date)
        and (p.valid_to is null or p.valid_to >= p_event_date)
      )
    )
  order by
    case when p.is_canonical_current then 0 else 1 end,
    p.valid_from desc nulls last,
    p.created_at asc
  limit 1;
$$;
