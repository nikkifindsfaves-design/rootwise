create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  topic text not null check (topic in ('General support', 'Billing question', 'Bug report')),
  destination_email text not null,
  message text not null,
  status text not null default 'submitted' check (status in ('submitted', 'in_progress', 'resolved')),
  created_at timestamptz not null default now()
);

create index if not exists support_requests_user_created_idx
  on public.support_requests (user_id, created_at desc);

alter table public.support_requests enable row level security;

create policy "support_requests_select_own"
  on public.support_requests for select
  using (auth.uid() = user_id);

create policy "support_requests_insert_own"
  on public.support_requests for insert
  with check (auth.uid() = user_id);
