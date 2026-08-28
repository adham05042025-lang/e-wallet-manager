-- Finance/task balance fix migration
-- Additive only. Keeps existing client budget/collection data while giving tasks and payments their own accounting history.

create table if not exists public.client_payments (
  id uuid primary key default gen_random_uuid(),
  client_id bigint not null references public.clients(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  amount numeric not null default 0,
  currency text not null default 'EGP',
  exchange_rate numeric not null default 1,
  amount_egp numeric not null default 0,
  month_year text not null,
  collected_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);

alter table public.clients
  add column if not exists collected_amount numeric not null default 0;

alter table public.tasks
  add column if not exists currency text not null default 'EGP',
  add column if not exists exchange_rate numeric not null default 1,
  add column if not exists amount_egp numeric;

update public.tasks
set amount_egp = coalesce(amount_egp, cost),
    exchange_rate = coalesce(exchange_rate, 1),
    currency = coalesce(currency, 'EGP')
where amount_egp is null or exchange_rate is null or currency is null;

create index if not exists client_payments_client_idx on public.client_payments(client_id, collected_at desc);
create index if not exists client_payments_month_idx on public.client_payments(month_year, collected_at desc);

alter table public.client_payments enable row level security;
drop policy if exists client_payments_owner_select on public.client_payments;
drop policy if exists client_payments_owner_insert on public.client_payments;
drop policy if exists client_payments_owner_update on public.client_payments;
drop policy if exists client_payments_owner_delete on public.client_payments;
create policy client_payments_owner_select on public.client_payments for select using (user_id = auth.uid() or user_id is null);
create policy client_payments_owner_insert on public.client_payments for insert with check (user_id = auth.uid() or user_id is null);
create policy client_payments_owner_update on public.client_payments for update using (user_id = auth.uid() or user_id is null) with check (user_id = auth.uid() or user_id is null);
create policy client_payments_owner_delete on public.client_payments for delete using (user_id = auth.uid() or user_id is null);

-- Backfill the legacy collected total once. It does not invent monthly payments.
update public.clients
set collected_amount = greatest(0, coalesce(total_budget, 0) - coalesce(remaining_budget, 0))
where coalesce(collected_amount, 0) = 0
  and coalesce(total_budget, 0) >= coalesce(remaining_budget, 0)
  and coalesce(remaining_budget, 0) > 0;
