-- Billing + credits foundation for Dead Gossip.
-- Adds subscription/add-on credit pools, immutable ledger, usage events, and webhook idempotency.

create type public.membership_tier as enum ('basic', 'pro', 'max');
create type public.billing_interval as enum ('monthly', 'quarterly', 'annual');
create type public.subscription_status as enum (
  'inactive',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid'
);
create type public.credit_ledger_event_type as enum (
  'pilot_grant',
  'subscription_grant',
  'addon_purchase',
  'usage_debit',
  'monthly_reset',
  'refund_reversal',
  'manual_adjustment'
);
create type public.credit_action_type as enum (
  'story_generate',
  'story_regenerate',
  'extraction_sonnet',
  'extraction_opus'
);

create table public.billing_customers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  stripe_subscription_id text unique,
  stripe_price_id text,
  tier public.membership_tier not null default 'basic',
  billing_interval public.billing_interval not null default 'monthly',
  status public.subscription_status not null default 'inactive',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_user_status_idx
  on public.subscriptions (user_id, status);

create table public.credit_balances (
  user_id uuid primary key references auth.users (id) on delete cascade,
  subscription_credits integer not null default 0 check (subscription_credits >= 0),
  addon_credits integer not null default 0 check (addon_credits >= 0),
  monthly_allocation integer not null default 0 check (monthly_allocation >= 0),
  monthly_reset_at timestamptz,
  daily_spend_cap integer check (daily_spend_cap is null or daily_spend_cap >= 0),
  pilot_mode_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  action_type public.credit_action_type not null,
  credits_charged integer not null check (credits_charged > 0),
  idempotency_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index usage_events_user_created_idx
  on public.usage_events (user_id, created_at desc);

create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_type public.credit_ledger_event_type not null,
  delta_subscription_credits integer not null default 0,
  delta_addon_credits integer not null default 0,
  resulting_subscription_credits integer not null check (resulting_subscription_credits >= 0),
  resulting_addon_credits integer not null check (resulting_addon_credits >= 0),
  action_type public.credit_action_type,
  related_usage_event_id uuid references public.usage_events (id) on delete set null,
  source text not null default 'system',
  metadata jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

create index credit_ledger_user_created_idx
  on public.credit_ledger (user_id, created_at desc);

create table public.billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  event_type text not null,
  processed_at timestamptz not null default now(),
  payload jsonb not null
);

create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  reason text,
  status text not null default 'requested' check (status in ('requested', 'completed', 'rejected')),
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_billing_customers_updated_at on public.billing_customers;
create trigger trg_billing_customers_updated_at
before update on public.billing_customers
for each row
execute function public.set_timestamp_updated_at();

drop trigger if exists trg_subscriptions_updated_at on public.subscriptions;
create trigger trg_subscriptions_updated_at
before update on public.subscriptions
for each row
execute function public.set_timestamp_updated_at();

drop trigger if exists trg_credit_balances_updated_at on public.credit_balances;
create trigger trg_credit_balances_updated_at
before update on public.credit_balances
for each row
execute function public.set_timestamp_updated_at();

drop trigger if exists trg_account_deletion_requests_updated_at on public.account_deletion_requests;
create trigger trg_account_deletion_requests_updated_at
before update on public.account_deletion_requests
for each row
execute function public.set_timestamp_updated_at();

create or replace function public.calculate_action_cost(p_action public.credit_action_type)
returns integer
language sql
immutable
as $$
  select case p_action
    when 'story_generate' then 2
    when 'story_regenerate' then 2
    when 'extraction_sonnet' then 3
    when 'extraction_opus' then 5
    else 0
  end;
$$;

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

  update public.credit_balances
  set
    subscription_credits = subscription_credits - v_sub_debit,
    addon_credits = addon_credits - v_addon_debit
  where user_id = p_user_id;

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

  update public.credit_balances
  set
    subscription_credits = greatest(subscription_credits + p_subscription_delta, 0),
    addon_credits = greatest(addon_credits + p_addon_delta, 0)
  where user_id = p_user_id;

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

  select subscription_credits, addon_credits
    into v_previous_subscription, v_addon
  from public.credit_balances
  where user_id = p_user_id
  for update;

  update public.credit_balances
  set
    subscription_credits = greatest(p_monthly_allocation, 0),
    monthly_allocation = greatest(p_monthly_allocation, 0),
    monthly_reset_at = now()
  where user_id = p_user_id;

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

alter table public.billing_customers enable row level security;
alter table public.subscriptions enable row level security;
alter table public.credit_balances enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.usage_events enable row level security;
alter table public.account_deletion_requests enable row level security;

create policy "billing_customers_select_own"
  on public.billing_customers for select using (auth.uid() = user_id);
create policy "billing_customers_insert_own"
  on public.billing_customers for insert with check (auth.uid() = user_id);
create policy "billing_customers_update_own"
  on public.billing_customers for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "subscriptions_select_own"
  on public.subscriptions for select using (auth.uid() = user_id);
create policy "subscriptions_insert_own"
  on public.subscriptions for insert with check (auth.uid() = user_id);
create policy "subscriptions_update_own"
  on public.subscriptions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "credit_balances_select_own"
  on public.credit_balances for select using (auth.uid() = user_id);
create policy "credit_balances_insert_own"
  on public.credit_balances for insert with check (auth.uid() = user_id);
create policy "credit_balances_update_own"
  on public.credit_balances for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "credit_ledger_select_own"
  on public.credit_ledger for select using (auth.uid() = user_id);

create policy "usage_events_select_own"
  on public.usage_events for select using (auth.uid() = user_id);

create policy "account_deletion_requests_select_own"
  on public.account_deletion_requests for select using (auth.uid() = user_id);
create policy "account_deletion_requests_insert_own"
  on public.account_deletion_requests for insert with check (auth.uid() = user_id);
