-- Per-tree canvas visual theme (picker on dashboard tree cards).
alter table public.trees
  add column if not exists canvas_theme text not null default 'string';
