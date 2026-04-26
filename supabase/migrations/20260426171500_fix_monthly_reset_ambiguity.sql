create or replace function public.reset_monthly_subscription_credits(
  p_user_id uuid,
  p_monthly_allocation integer,
  p_idempotency_key text,
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
declare
  v_addon integer;
  v_previous_subscription integer;
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

  select b.subscription_credits, b.addon_credits
    into v_previous_subscription, v_addon
  from public.credit_balances b
  where b.user_id = p_user_id
  for update;

  update public.credit_balances b
  set
    subscription_credits = greatest(p_monthly_allocation, 0),
    monthly_allocation = greatest(p_monthly_allocation, 0),
    monthly_reset_at = now()
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
    'monthly_reset',
    subscription_credits - coalesce(v_previous_subscription, 0),
    0,
    subscription_credits,
    addon_credits,
    'billing_cycle',
    coalesce(p_metadata, '{}'::jsonb),
    p_idempotency_key
  );

  return query select true, subscription_credits, addon_credits;
end;
$$;
