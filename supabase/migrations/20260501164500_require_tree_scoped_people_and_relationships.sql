-- Tree isolation hardening.
-- No users are live yet, so resettable orphan/cross-tree rows are removed before
-- adding constraints that prevent them from coming back.

delete from public.relationships r
where
  r.tree_id is null
  or not exists (
    select 1
    from public.trees t
    where t.id = r.tree_id
      and t.user_id = r.user_id
  )
  or not exists (
    select 1
    from public.persons pa
    join public.persons pb on pb.id = r.person_b_id
    where pa.id = r.person_a_id
      and pa.user_id = r.user_id
      and pb.user_id = r.user_id
      and pa.tree_id = r.tree_id
      and pb.tree_id = r.tree_id
  );

delete from public.persons p
where
  p.tree_id is null
  or not exists (
    select 1
    from public.trees t
    where t.id = p.tree_id
      and t.user_id = p.user_id
  );

alter table public.persons
  drop constraint if exists persons_tree_id_fkey;

alter table public.persons
  alter column tree_id set not null,
  add constraint persons_tree_id_fkey
    foreign key (tree_id) references public.trees (id) on delete cascade;

alter table public.persons
  drop constraint if exists persons_id_tree_id_key,
  drop constraint if exists persons_id_user_id_key;

alter table public.persons
  add constraint persons_id_tree_id_key unique (id, tree_id),
  add constraint persons_id_user_id_key unique (id, user_id);

alter table public.relationships
  drop constraint if exists relationships_tree_id_fkey,
  drop constraint if exists relationships_person_a_tree_id_fkey,
  drop constraint if exists relationships_person_b_tree_id_fkey,
  drop constraint if exists relationships_person_a_user_id_fkey,
  drop constraint if exists relationships_person_b_user_id_fkey;

alter table public.relationships
  alter column tree_id set not null,
  add constraint relationships_tree_id_fkey
    foreign key (tree_id) references public.trees (id) on delete cascade,
  add constraint relationships_person_a_tree_id_fkey
    foreign key (person_a_id, tree_id) references public.persons (id, tree_id) on delete cascade,
  add constraint relationships_person_b_tree_id_fkey
    foreign key (person_b_id, tree_id) references public.persons (id, tree_id) on delete cascade,
  add constraint relationships_person_a_user_id_fkey
    foreign key (person_a_id, user_id) references public.persons (id, user_id) on delete cascade,
  add constraint relationships_person_b_user_id_fkey
    foreign key (person_b_id, user_id) references public.persons (id, user_id) on delete cascade;
