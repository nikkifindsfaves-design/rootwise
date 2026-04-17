alter table public.photos
add column if not exists caption text;

create table if not exists public.photo_event_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  photo_id uuid not null references public.photos (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (photo_id, event_id)
);

create index if not exists photo_event_tags_user_id_idx
  on public.photo_event_tags (user_id);
create index if not exists photo_event_tags_photo_id_idx
  on public.photo_event_tags (photo_id);
create index if not exists photo_event_tags_event_id_idx
  on public.photo_event_tags (event_id);
