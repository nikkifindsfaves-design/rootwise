-- App vibe ids (dashboard) include `hearthside` (formerly surfaced as `old_timey`).
-- Remote DBs may still enforce an older `trees_vibe_check` list; refresh it here.

alter table public.trees drop constraint if exists trees_vibe_check;

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
