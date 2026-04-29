-- Rootwise — consolidated PostgreSQL schema for Supabase (structure only, no data).
-- Sources: supabase/migrations/*.sql and table/column usage across the app.
-- auth.users is provided by Supabase Auth.
--
-- RLS on public tables: only person_notes and event_sources are defined in repo
-- migrations; other tables are created without RLS here (match historical migrations).
--
-- Storage buckets `documents` and `photos` are required by the app; bucket rows and
-- storage.objects policies below are inferred from upload paths (`<user_id>/...`)
-- and are not present in SQL migrations in this repo.

-- ---------------------------------------------------------------------------
-- Extensions (Supabase projects usually have these; safe if already present)
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- public.place_identities (stable identity), public.places (historical versions)
-- ---------------------------------------------------------------------------
create table public.place_identities (
  id uuid primary key default gen_random_uuid(),
  country text not null default '',
  canonical_township text,
  canonical_county text,
  canonical_state text,
  canonical_display_name text not null default '',
  created_at timestamptz not null default now()
);

create table public.places (
  id uuid primary key default gen_random_uuid(),
  place_identity_id uuid not null references public.place_identities (id) on delete cascade,
  township text,
  county text,
  state text,
  country text not null default '',
  valid_from date,
  valid_to date,
  historical_context text,
  is_canonical_current boolean not null default false,
  source_dataset text,
  source_ref text,
  created_at timestamptz not null default now(),
  constraint places_valid_range_chk
    check (valid_from is null or valid_to is null or valid_from <= valid_to)
);

create index if not exists places_place_identity_id_idx
  on public.places (place_identity_id);
create index if not exists places_location_lookup_idx
  on public.places (country, state, county, township);
create index if not exists places_valid_window_idx
  on public.places (valid_from, valid_to);
create unique index if not exists places_one_current_canonical_per_identity_idx
  on public.places (place_identity_id)
  where is_canonical_current = true;

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

-- ---------------------------------------------------------------------------
-- public.trees
-- ---------------------------------------------------------------------------
create table public.trees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  vibe text not null default 'gossip_girl',
  canvas_theme text not null default 'dead_gossip',
  created_at timestamptz not null default now()
);

create index if not exists trees_user_id_idx on public.trees (user_id);

alter table public.trees
  add constraint trees_vibe_check check (
    vibe in (
      'classic',
      'gossip_girl',
      'hearthside',
      'southern_gothic',
      'gen_z',
      'old_timey'
    )
  );

-- ---------------------------------------------------------------------------
-- public.persons
-- ---------------------------------------------------------------------------
create table public.persons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tree_id uuid references public.trees (id) on delete set null,
  first_name text,
  middle_name text,
  last_name text,
  birth_date text,
  death_date text,
  birth_place_id uuid references public.places (id) on delete set null,
  death_place_id uuid references public.places (id) on delete set null,
  photo_url text,
  gender text,
  notes text,
  marital_status text,
  cause_of_death text,
  surviving_spouse text,
  military_branch text,
  service_number text
);

create index if not exists persons_user_id_idx on public.persons (user_id);
create index if not exists persons_tree_id_idx on public.persons (tree_id)
  where tree_id is not null;
create index if not exists persons_birth_place_id_idx on public.persons (birth_place_id)
  where birth_place_id is not null;
create index if not exists persons_death_place_id_idx on public.persons (death_place_id)
  where death_place_id is not null;

-- ---------------------------------------------------------------------------
-- public.records (tree_id intentionally without FK — see migration comment)
-- ---------------------------------------------------------------------------
create table public.records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tree_id uuid,
  file_url text not null,
  file_type text,
  record_type text,
  document_subtype text,
  ai_response jsonb,
  created_at timestamptz not null default now()
);

create index if not exists records_user_id_idx on public.records (user_id);
create index if not exists records_tree_id_idx on public.records (tree_id)
  where tree_id is not null;

-- ---------------------------------------------------------------------------
-- public.pending_persons
-- ---------------------------------------------------------------------------
create table public.pending_persons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  record_id uuid not null references public.records (id) on delete cascade,
  first_name text,
  middle_name text,
  last_name text,
  birth_date text,
  death_date text,
  gender text,
  notes text,
  status text not null default 'pending'
);

create index if not exists pending_persons_record_id_idx on public.pending_persons (record_id);
create index if not exists pending_persons_user_id_idx on public.pending_persons (user_id);

-- ---------------------------------------------------------------------------
-- public.events
-- ---------------------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  person_id uuid not null references public.persons (id) on delete cascade,
  record_id uuid references public.records (id) on delete set null,
  event_type text not null,
  event_date text,
  event_place_id uuid references public.places (id) on delete set null,
  description text,
  notes text,
  research_notes text,
  story_short text,
  story_full text,
  created_at timestamptz not null default now()
);

create index if not exists events_user_person_idx on public.events (user_id, person_id);
create index if not exists events_record_id_idx on public.events (record_id)
  where record_id is not null;

-- ---------------------------------------------------------------------------
-- public.relationships
-- ---------------------------------------------------------------------------
create table public.relationships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tree_id uuid references public.trees (id) on delete set null,
  person_a_id uuid not null references public.persons (id) on delete cascade,
  person_b_id uuid not null references public.persons (id) on delete cascade,
  relationship_type text not null
);

create index if not exists relationships_user_id_idx on public.relationships (user_id);
create index if not exists relationships_tree_id_idx on public.relationships (tree_id)
  where tree_id is not null;
create index if not exists relationships_person_a_idx on public.relationships (person_a_id);
create index if not exists relationships_person_b_idx on public.relationships (person_b_id);

-- ---------------------------------------------------------------------------
-- public.photos
-- ---------------------------------------------------------------------------
create table public.photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  file_url text not null,
  photo_date text,
  caption text,
  natural_width double precision,
  natural_height double precision,
  crop_x double precision,
  crop_y double precision,
  crop_zoom double precision,
  created_at timestamptz not null default now()
);

create index if not exists photos_user_id_idx on public.photos (user_id);

-- ---------------------------------------------------------------------------
-- public.photo_tags
-- ---------------------------------------------------------------------------
create table public.photo_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  photo_id uuid not null references public.photos (id) on delete cascade,
  person_id uuid not null references public.persons (id) on delete cascade,
  is_primary boolean not null default false,
  crop_x double precision,
  crop_y double precision,
  crop_zoom double precision,
  unique (photo_id, person_id)
);

create index if not exists photo_tags_user_id_idx on public.photo_tags (user_id);
create index if not exists photo_tags_person_id_idx on public.photo_tags (person_id);
create index if not exists photo_tags_photo_id_idx on public.photo_tags (photo_id);

-- ---------------------------------------------------------------------------
-- public.photo_event_tags
-- ---------------------------------------------------------------------------
create table public.photo_event_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  photo_id uuid not null references public.photos (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (photo_id, event_id)
);

create index if not exists photo_event_tags_user_id_idx on public.photo_event_tags (user_id);
create index if not exists photo_event_tags_photo_id_idx on public.photo_event_tags (photo_id);
create index if not exists photo_event_tags_event_id_idx on public.photo_event_tags (event_id);

-- ---------------------------------------------------------------------------
-- public.person_notes (from migration 20260327120000)
-- ---------------------------------------------------------------------------
create table public.person_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  person_id uuid not null references public.persons (id) on delete cascade,
  content text not null default '',
  updated_at timestamptz not null default now(),
  unique (user_id, person_id)
);

create index if not exists person_notes_user_id_idx on public.person_notes (user_id);

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

-- ---------------------------------------------------------------------------
-- public.event_sources (from migrations 20260329120000 + 20260330120000)
-- ---------------------------------------------------------------------------
create table public.event_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  record_id uuid not null references public.records (id) on delete cascade,
  notes text,
  created_at timestamptz not null default now(),
  unique (event_id, record_id)
);

create index if not exists event_sources_event_id_idx on public.event_sources (event_id);
create index if not exists event_sources_record_id_idx on public.event_sources (record_id);
create index if not exists event_sources_user_id_idx on public.event_sources (user_id);

alter table public.event_sources enable row level security;

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

-- ---------------------------------------------------------------------------
-- public.place_review_queue (unmatched/ambiguous places for manual review)
-- ---------------------------------------------------------------------------
create table public.place_review_queue (
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

create policy "place_review_queue_select_own"
  on public.place_review_queue for select
  using (auth.uid() = user_id);
create policy "place_review_queue_insert_own"
  on public.place_review_queue for insert
  with check (auth.uid() = user_id);
create policy "place_review_queue_update_own"
  on public.place_review_queue for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "place_review_queue_delete_own"
  on public.place_review_queue for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Storage buckets (names used by app: documents, photos)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('documents', 'documents', true, 52428800, null),
  ('photos', 'photos', true, 52428800, null)
on conflict (id) do nothing;

-- Storage policies: first path segment is auth.uid() (see process-document, tree-canvas, person page).
create policy "documents_select_public"
  on storage.objects for select
  to public
  using (bucket_id = 'documents');

create policy "documents_insert_own_folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "documents_update_own_folder"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "documents_delete_own_folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "photos_select_public"
  on storage.objects for select
  to public
  using (bucket_id = 'photos');

create policy "photos_insert_own_folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "photos_update_own_folder"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "photos_delete_own_folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
