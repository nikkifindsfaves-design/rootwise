-- Optional link from a processed record to the tree the upload was made from.
-- (No FK: `trees` may be managed outside this repo’s migrations.)
alter table public.records
  add column if not exists tree_id uuid;

create index if not exists records_tree_id_idx on public.records (tree_id)
  where tree_id is not null;
