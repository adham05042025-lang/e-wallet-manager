-- e-wallet-manager / Supabase wallet migration v1
-- Safe, additive-only migration: no DROP/TRUNCATE/DELETE.

create extension if not exists pgcrypto;

-- Existing tables: add additive fields needed by the new UI.
alter table public.clients
  add column if not exists collection_status text not null default 'not_collected',
  add column if not exists collected_amount numeric not null default 0,
  add column if not exists delivery_status text not null default 'not_started',
  add column if not exists delivered_amount numeric not null default 0,
  add column if not exists work_status text not null default 'not_started',
  add column if not exists currency text not null default 'EGP',
  add column if not exists transfer_fee numeric not null default 0,
  add column if not exists exchange_rate numeric not null default 1,
  add column if not exists total_budget_egp numeric,
  add column if not exists remaining_budget_egp numeric;

alter table public.daily_expenses
  add column if not exists user_id uuid references auth.users(id),
  add column if not exists currency text not null default 'EGP';

alter table public.tasks
  add column if not exists currency text not null default 'EGP',
  add column if not exists exchange_rate numeric,
  add column if not exists amount_egp numeric,
  add column if not exists completed_at timestamptz;

alter table public.salaries
  add column if not exists status text not null default 'pending',
  add column if not exists received_at timestamptz,
  add column if not exists currency text not null default 'EGP';

alter table public.expenses
  add column if not exists is_recurring boolean not null default false,
  add column if not exists frequency text not null default 'monthly',
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists series_id uuid,
  add column if not exists paid_at timestamptz,
  add column if not exists currency text not null default 'EGP';

-- Unified money movements. Values are stored in original currency and EGP snapshot.
create table if not exists public.money_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  kind text not null default 'receivable',
  movement_type text,
  counterparty text,
  amount numeric not null default 0,
  currency text not null default 'EGP',
  fee numeric not null default 0,
  transfer_fee numeric not null default 0,
  exchange_rate numeric,
  amount_egp numeric not null default 0,
  net_amount_egp numeric not null default 0,
  settled_amount numeric not null default 0,
  status text not null default 'pending',
  due_date date,
  notes text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Compatibility additions for deployments where money_movements was created by an earlier UI migration.
alter table public.money_movements
  add column if not exists movement_type text,
  add column if not exists counterparty text,
  add column if not exists transfer_fee numeric not null default 0,
  add column if not exists net_amount_egp numeric not null default 0,
  add column if not exists settled_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

-- Monthly obligation plans and one payment row per month.
create table if not exists public.recurring_obligations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  amount numeric not null default 0,
  currency text not null default 'EGP',
  start_date date not null,
  end_date date,
  frequency text not null default 'monthly',
  day_of_month smallint not null default 1,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.obligation_payments (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references public.recurring_obligations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  due_month date not null,
  amount numeric not null default 0,
  currency text not null default 'EGP',
  status text not null default 'pending',
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  unique (obligation_id, due_month)
);

-- Reports can be generated from these rows without local storage.
create index if not exists money_movements_user_created_idx on public.money_movements(user_id, created_at desc);
create index if not exists money_movements_user_status_idx on public.money_movements(user_id, status);
create index if not exists recurring_obligations_user_idx on public.recurring_obligations(user_id, is_active);
create index if not exists obligation_payments_user_month_idx on public.obligation_payments(user_id, due_month desc);
create index if not exists tasks_user_client_idx on public.tasks(user_id, client_id);

alter table public.money_movements enable row level security;
alter table public.recurring_obligations enable row level security;
alter table public.obligation_payments enable row level security;

-- Policies for the new tables. Existing table policies are left intact.
drop policy if exists money_movements_owner_select on public.money_movements;
drop policy if exists money_movements_owner_insert on public.money_movements;
drop policy if exists money_movements_owner_update on public.money_movements;
drop policy if exists money_movements_owner_delete on public.money_movements;
create policy money_movements_owner_select on public.money_movements for select using (user_id = auth.uid());
create policy money_movements_owner_insert on public.money_movements for insert with check (user_id = auth.uid());
create policy money_movements_owner_update on public.money_movements for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy money_movements_owner_delete on public.money_movements for delete using (user_id = auth.uid());

drop policy if exists recurring_obligations_owner_select on public.recurring_obligations;
drop policy if exists recurring_obligations_owner_insert on public.recurring_obligations;
drop policy if exists recurring_obligations_owner_update on public.recurring_obligations;
drop policy if exists recurring_obligations_owner_delete on public.recurring_obligations;
create policy recurring_obligations_owner_select on public.recurring_obligations for select using (user_id = auth.uid());
create policy recurring_obligations_owner_insert on public.recurring_obligations for insert with check (user_id = auth.uid());
create policy recurring_obligations_owner_update on public.recurring_obligations for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy recurring_obligations_owner_delete on public.recurring_obligations for delete using (user_id = auth.uid());

drop policy if exists obligation_payments_owner_select on public.obligation_payments;
drop policy if exists obligation_payments_owner_insert on public.obligation_payments;
drop policy if exists obligation_payments_owner_update on public.obligation_payments;
drop policy if exists obligation_payments_owner_delete on public.obligation_payments;
create policy obligation_payments_owner_select on public.obligation_payments for select using (user_id = auth.uid());
create policy obligation_payments_owner_insert on public.obligation_payments for insert with check (user_id = auth.uid());
create policy obligation_payments_owner_update on public.obligation_payments for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy obligation_payments_owner_delete on public.obligation_payments for delete using (user_id = auth.uid());
