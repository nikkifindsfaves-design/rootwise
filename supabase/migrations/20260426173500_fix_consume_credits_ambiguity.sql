create or replace function public.consume_credits(
  p_user_id uuid,
  p_action public.credit_action_type,
  p_idempotency_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  success boolean,
  error_code text,
  charged_credits integer,
  subscription_credits integer,
  addon_credits integer
)
language plpgsql
security definer
as $$
declare
  v_cost integer;
  v_balance public.credit_balances%rowtype;
  v_sub_debit integer;
  v_addon_debit integer;
  v_usage_id uuid;
begin
  select l.resulting_subscription_credits, l.resulting_addon_credits
    into subscription_credits, addon_credits
  from public.credit_ledger l
  where l.idempotency_key = p_idempotency_key;

  if found then
    return query
    select true, null::text, public.calculate_action_cost(p_action), subscription_credits, addon_credits;
    return;
  end if;

  v_cost := public.calculate_action_cost(p_action);
  if v_cost <= 0 then
    return query select false, 'invalid_action', 0, 0, 0;
    return;
  end if;

  insert into public.credit_balances (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select *
  into v_balance
  from public.credit_balances
  where user_id = p_user_id
  for update;

  if coalesce(v_balance.subscription_credits, 0) + coalesce(v_balance.addon_credits, 0) < v_cost then
    return query
    select false, 'insufficient_credits', v_cost, v_balance.subscription_credits, v_balance.addon_credits;
    return;
  end if;

  v_sub_debit := least(v_balance.subscription_credits, v_cost);
  v_addon_debit := v_cost - v_sub_debit;

  update public.credit_balances b
  set
    subscription_credits = b.subscription_credits - v_sub_debit,
    addon_credits = b.addon_credits - v_addon_debit
  where b.user_id = p_user_id;

  insert into public.usage_events (
    user_id,
    action_type,
    credits_charged,
    idempotency_key,
    metadata
  ) values (
    p_user_id,
    p_action,
    v_cost,
    p_idempotency_key,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_usage_id;

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
    action_type,
    related_usage_event_id,
    source,
    metadata,
    idempotency_key
  ) values (
    p_user_id,
    'usage_debit',
    -v_sub_debit,
    -v_addon_debit,
    subscription_credits,
    addon_credits,
    p_action,
    v_usage_id,
    'api',
    coalesce(p_metadata, '{}'::jsonb),
    p_idempotency_key
  );

  return query select true, null::text, v_cost, subscription_credits, addon_credits;
end;
$$;
