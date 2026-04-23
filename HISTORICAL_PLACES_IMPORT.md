# Historical Places Import Runbook

This project now uses:

- `place_identities` = stable modern place identity
- `places` = historical place versions (time-bounded rows)

## Source Datasets

- GNIS current names (USGS): current/canonical U.S. place baseline
- Newberry Atlas historical counties: historical county versions and date windows

## One-Time Schema Step

Run migration:

- `supabase/migrations/20260422120000_places_two_table_history.sql`

## Import Pipeline (repeatable)

Run scripts in order:

1. `supabase/ingest/01_place_staging_tables.sql`
2. load raw files into:
   - `ingest.gnis_us_current`
   - `ingest.newberry_county_history`
3. `supabase/ingest/02_ingest_gnis_current.sql`
4. `supabase/ingest/03_ingest_newberry_history.sql`

## Staging Column Expectations

### `ingest.gnis_us_current`

- `geoname_id` (text, unique id)
- `feature_name` (mapped to township/city slot)
- `county_name`
- `state_name`
- `country_name` (`United States` default if null)

### `ingest.newberry_county_history`

- `source_id` (text, unique source row id)
- `county_name`
- `state_name`
- `country_name` (`United States` default if null)
- `valid_from` (date)
- `valid_to` (date)
- `historical_context` (text summary)

## Data Rules

- Current canonical row uses:
  - `is_canonical_current = true`
  - `valid_to is null`
- Historical rows use bounded or semi-bounded date windows and `is_canonical_current = false`.
- `source_dataset` + `source_ref` are always set for imported rows to support re-runs and auditability.

## Verification Queries

```sql
-- Count identities vs versions
select
  (select count(*) from public.place_identities) as identity_count,
  (select count(*) from public.places) as version_count;
```

```sql
-- Ensure only one current canonical row per identity
select place_identity_id, count(*) as current_rows
from public.places
where is_canonical_current = true
group by place_identity_id
having count(*) > 1;
```

```sql
-- Spot check historical rows
select place_identity_id, township, county, state, valid_from, valid_to, source_dataset, source_ref
from public.places
where source_dataset in ('gnis', 'newberry')
order by source_dataset, state, county
limit 100;
```
