create or replace function public.grant_credits(
  p_user_id uuid,
  p_subscription_delta integer,
  p_addon_delta integer,
  p_event_type public.credit_ledger_event_type,
  p_idempotency_key text,
  p_source text default 'system',
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  success boolean,
  subscription_credits integer,
  addon_credits integer
)
language plpgsql
security definer
as $$
begin
  select l.resulting_subscription_credits, l.resulting_addon_credits
    into subscription_credits, addon_credits
  from public.credit_ledger l
  where l.idempotency_key = p_idempotency_key;

  if found then
    return query select true, subscription_credits, addon_credits;
    return;
  end if;

  insert into public.credit_balances (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  update public.credit_balances b
  set
    subscription_credits = greatest(b.subscription_credits + p_subscription_delta, 0),
    addon_credits = greatest(b.addon_credits + p_addon_delta, 0)
  where b.user_id = p_user_id;

  select b.subscription_credits, b.addon_credits
    into subscription_credits, addon_credits
  from public.credit_balances b
  where b.user_id = p_user_id;

  insert into public.credit_ledger (
    user_id,
    event_type,
    delta_subscription_credits,
    delta_addon_credits,
    resulting_subscription_credits,
    resulting_addon_credits,
    source,
    metadata,
    idempotency_key
  ) values (
    p_user_id,
    p_event_type,
    p_subscription_delta,
    p_addon_delta,
    subscription_credits,
    addon_credits,
    p_source,
    coalesce(p_metadata, '{}'::jsonb),
    p_idempotency_key
  );

  return query select true, subscription_credits, addon_credits;
end;
$$;
