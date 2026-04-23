-- Ingest Newberry county history as historical place versions.
-- Prerequisites:
-- 1) Run 01_place_staging_tables.sql
-- 2) Load rows into ingest.newberry_county_history
-- 3) Run 02_ingest_gnis_current.sql first (ensures baseline identities exist)

with normalized as (
  select
    source_id,
    null::text as township,
    nullif(trim(county_name), '') as county,
    nullif(trim(state_name), '') as state,
    coalesce(nullif(trim(country_name), ''), 'United States') as country,
    valid_from,
    valid_to,
    nullif(trim(historical_context), '') as historical_context
  from ingest.newberry_county_history
  where nullif(trim(county_name), '') is not null
),
identity_insert as (
  insert into public.place_identities (
    country,
    canonical_township,
    canonical_county,
    canonical_state,
    canonical_display_name
  )
  select distinct
    n.country,
    n.township,
    n.county,
    n.state,
    concat_ws(', ', n.township, n.county, n.state, n.country)
  from normalized n
  where not exists (
    select 1
    from public.place_identities pi
    where pi.country = n.country
      and pi.canonical_township is not distinct from n.township
      and pi.canonical_county is not distinct from n.county
      and pi.canonical_state is not distinct from n.state
      and pi.canonical_display_name = concat_ws(', ', n.township, n.county, n.state, n.country)
  )
  returning id
),
identity_map as (
  select
    n.*,
    pi.id as place_identity_id
  from normalized n
  join public.place_identities pi
    on pi.country = n.country
   and pi.canonical_township is not distinct from n.township
   and pi.canonical_county is not distinct from n.county
   and pi.canonical_state is not distinct from n.state
   and pi.canonical_display_name = concat_ws(', ', n.township, n.county, n.state, n.country)
)
insert into public.places (
  place_identity_id,
  township,
  county,
  state,
  country,
  valid_from,
  valid_to,
  historical_context,
  is_canonical_current,
  source_dataset,
  source_ref
)
select
  m.place_identity_id,
  m.township,
  m.county,
  m.state,
  m.country,
  m.valid_from,
  m.valid_to,
  m.historical_context,
  false,
  'newberry',
  m.source_id
from identity_map m
where not exists (
  select 1
  from public.places p
  where p.place_identity_id = m.place_identity_id
    and p.township is not distinct from m.township
    and p.county is not distinct from m.county
    and p.state is not distinct from m.state
    and p.country = m.country
    and p.valid_from is not distinct from m.valid_from
    and p.valid_to is not distinct from m.valid_to
    and coalesce(p.historical_context, '') = coalesce(m.historical_context, '')
    and p.source_dataset = 'newberry'
    and p.source_ref = m.source_id
);
