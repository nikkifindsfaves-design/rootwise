-- Staging tables for repeatable historical place imports.
-- Safe to run multiple times.

create schema if not exists ingest;

create table if not exists ingest.gnis_us_current (
  geoname_id text primary key,
  feature_name text not null,
  county_name text,
  state_name text,
  country_name text not null default 'United States',
  feature_class text,
  feature_code text,
  latitude double precision,
  longitude double precision
);

create table if not exists ingest.newberry_county_history (
  source_id text primary key,
  county_name text,
  state_name text,
  country_name text not null default 'United States',
  valid_from date,
  valid_to date,
  historical_context text
);

create index if not exists ingest_gnis_state_county_idx
  on ingest.gnis_us_current (state_name, county_name);

create index if not exists ingest_newberry_state_county_idx
  on ingest.newberry_county_history (state_name, county_name);
