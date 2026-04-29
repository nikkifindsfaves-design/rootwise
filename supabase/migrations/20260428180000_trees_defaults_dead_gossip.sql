-- Default vibe + canvas theme for new trees (matches app constants).
alter table public.trees alter column vibe set default 'gossip_girl';
alter table public.trees alter column canvas_theme set default 'dead_gossip';
