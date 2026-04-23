-- Ingest current GNIS U.S. records into place_identities + canonical current place rows.
-- Prerequisites:
-- 1) Run 01_place_staging_tables.sql
-- 2) Load GNIS rows into ingest.gnis_us_current (copy/import)

with normalized as (
  select
    geoname_id,
    nullif(trim(feature_name), '') as township,
    nullif(trim(county_name), '') as county,
    nullif(trim(state_name), '') as state,
    coalesce(nullif(trim(country_name), ''), 'United States') as country
  from ingest.gnis_us_current
  where nullif(trim(feature_name), '') is not null
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
select distinct
  m.place_identity_id,
  m.township,
  m.county,
  m.state,
  m.country,
  null,
  null,
  null,
  true,
  'gnis',
  m.geoname_id
from identity_map m
where not exists (
  select 1
  from public.places p
  where p.place_identity_id = m.place_identity_id
    and p.township is not distinct from m.township
    and p.county is not distinct from m.county
    and p.state is not distinct from m.state
    and p.country = m.country
    and p.valid_from is null
    and p.valid_to is null
    and p.is_canonical_current = true
);
