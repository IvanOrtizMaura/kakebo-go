-- ============================================================
-- Kakebo Go — Initial Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ── user_profiles ────────────────────────────────────────────
create table if not exists public.user_profiles (
  id                          uuid primary key references auth.users(id) on delete cascade,
  monthly_net_income          numeric(12,2) not null default 0,
  fixed_expenses_description  text not null default '',
  savings_percentage          numeric(5,2) not null default 20,
  has_high_interest_debt      boolean not null default false,
  has_partner                 boolean not null default false,
  onboarding_completed        boolean not null default false,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

alter table public.user_profiles enable row level security;
create policy "Owner can read own profile"  on public.user_profiles for select using (auth.uid() = id);
create policy "Owner can insert own profile" on public.user_profiles for insert with check (auth.uid() = id);
create policy "Owner can update own profile" on public.user_profiles for update using (auth.uid() = id);

-- ── months ───────────────────────────────────────────────────
create table if not exists public.months (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  year       integer not null,
  month      integer not null check (month between 1 and 12),
  created_at timestamptz not null default now(),
  unique (user_id, year, month)
);

alter table public.months enable row level security;
create policy "Owner months" on public.months for all using (auth.uid() = user_id);

-- ── ingresos ─────────────────────────────────────────────────
create table if not exists public.ingresos (
  id          uuid primary key default gen_random_uuid(),
  month_id    uuid not null references public.months(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  fuente      text not null default '',
  dia_de_paga date,
  esperado    numeric(12,2) not null default 0,
  real        numeric(12,2) not null default 0,
  depositado  boolean not null default false,
  order_index integer not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.ingresos enable row level security;
create policy "Owner ingresos" on public.ingresos for all using (auth.uid() = user_id);

-- ── facturas ─────────────────────────────────────────────────
create table if not exists public.facturas (
  id           uuid primary key default gen_random_uuid(),
  month_id     uuid not null references public.months(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null default '',
  fecha        date,
  presupuestado numeric(12,2) not null default 0,
  real          numeric(12,2) not null default 0,
  is_recurring  boolean not null default true,
  order_index   integer not null default 0,
  created_at    timestamptz not null default now()
);

alter table public.facturas enable row level security;
create policy "Owner facturas" on public.facturas for all using (auth.uid() = user_id);

-- ── gastos ───────────────────────────────────────────────────
create table if not exists public.gastos (
  id            uuid primary key default gen_random_uuid(),
  month_id      uuid not null references public.months(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null default '',
  presupuestado numeric(12,2) not null default 0,
  real          numeric(12,2) not null default 0,
  tipo          text not null default 'variables' check (tipo in ('fijos','variables')),
  order_index   integer not null default 0,
  created_at    timestamptz not null default now()
);

alter table public.gastos enable row level security;
create policy "Owner gastos" on public.gastos for all using (auth.uid() = user_id);

-- ── ahorros ──────────────────────────────────────────────────
create table if not exists public.ahorros (
  id            uuid primary key default gen_random_uuid(),
  month_id      uuid not null references public.months(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null default '',
  presupuestado numeric(12,2) not null default 0,
  real          numeric(12,2) not null default 0,
  order_index   integer not null default 0,
  created_at    timestamptz not null default now()
);

alter table public.ahorros enable row level security;
create policy "Owner ahorros" on public.ahorros for all using (auth.uid() = user_id);

-- ── pareja ───────────────────────────────────────────────────
create table if not exists public.pareja (
  id            uuid primary key default gen_random_uuid(),
  month_id      uuid not null references public.months(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null default '',
  presupuestado numeric(12,2) not null default 0,
  real          numeric(12,2) not null default 0,
  order_index   integer not null default 0,
  created_at    timestamptz not null default now()
);

alter table public.pareja enable row level security;
create policy "Owner pareja" on public.pareja for all using (auth.uid() = user_id);

-- ── fondos_ahorro (master) ───────────────────────────────────
create table if not exists public.fondos_ahorro (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  name           text not null default '',
  total_amount   numeric(12,2) not null default 0,
  monthly_amount numeric(12,2) not null default 0,
  start_year     integer not null,
  start_month    integer not null check (start_month between 1 and 12),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

alter table public.fondos_ahorro enable row level security;
create policy "Owner fondos_ahorro" on public.fondos_ahorro for all using (auth.uid() = user_id);

-- ── fondos_ahorro_monthly ─────────────────────────────────────
create table if not exists public.fondos_ahorro_monthly (
  id            uuid primary key default gen_random_uuid(),
  fondo_id      uuid not null references public.fondos_ahorro(id) on delete cascade,
  month_id      uuid not null references public.months(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  presupuestado numeric(12,2) not null default 0,
  real          numeric(12,2) not null default 0,
  created_at    timestamptz not null default now(),
  unique (fondo_id, month_id)
);

alter table public.fondos_ahorro_monthly enable row level security;
create policy "Owner fondos_ahorro_monthly" on public.fondos_ahorro_monthly for all using (auth.uid() = user_id);

-- ── deudas (master) ──────────────────────────────────────────
create table if not exists public.deudas (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  name             text not null default '',
  type             text not null default 'bank' check (type in ('bank','savings')),
  total_amount     numeric(12,2) not null default 0,
  interest_rate    numeric(5,2) not null default 0,
  monthly_payment  numeric(12,2) not null default 0,
  amount_remaining numeric(12,2) not null default 0,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);

alter table public.deudas enable row level security;
create policy "Owner deudas" on public.deudas for all using (auth.uid() = user_id);

-- ── deudas_monthly ───────────────────────────────────────────
create table if not exists public.deudas_monthly (
  id            uuid primary key default gen_random_uuid(),
  deuda_id      uuid not null references public.deudas(id) on delete cascade,
  month_id      uuid not null references public.months(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  presupuestado numeric(12,2) not null default 0,
  real          numeric(12,2) not null default 0,
  created_at    timestamptz not null default now(),
  unique (deuda_id, month_id)
);

alter table public.deudas_monthly enable row level security;
create policy "Owner deudas_monthly" on public.deudas_monthly for all using (auth.uid() = user_id);
