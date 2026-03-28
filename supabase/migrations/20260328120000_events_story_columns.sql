alter table public.events
  add column if not exists story_short text,
  add column if not exists story_full text;
