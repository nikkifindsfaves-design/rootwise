-- Add new paid tier for billing subscriptions.
do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'membership_tier'
      and e.enumlabel = 'possessed'
  ) then
    alter type public.membership_tier add value 'possessed';
  end if;
end;
$$;
