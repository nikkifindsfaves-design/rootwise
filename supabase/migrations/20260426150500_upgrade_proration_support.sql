-- Support invoice-paid upgrade proration grants.
do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'credit_ledger_event_type'
      and e.enumlabel = 'upgrade_proration_grant'
  ) then
    alter type public.credit_ledger_event_type add value 'upgrade_proration_grant';
  end if;
end;
$$;

alter table public.subscriptions
  add column if not exists pending_upgrade_from_tier public.membership_tier,
  add column if not exists pending_upgrade_to_tier public.membership_tier,
  add column if not exists pending_upgrade_credits integer not null default 0 check (pending_upgrade_credits >= 0),
  add column if not exists pending_upgrade_session_id text;
