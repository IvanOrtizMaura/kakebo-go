-- ============================================================
-- Migration 003: Deudas extended fields, ahorro_templates,
--                and pareja auto-calc profile fields
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- ── deudas: add principal_amount, start_year, start_month, num_months ──
alter table public.deudas
  add column if not exists principal_amount numeric(12,2) not null default 0,
  add column if not exists start_year       integer,
  add column if not exists start_month      integer,
  add column if not exists num_months       integer; -- null = indefinite / "para toda la vida"

-- Back-fill principal_amount from total_amount for existing records
update public.deudas set principal_amount = total_amount where principal_amount = 0;

-- ── ahorro_templates ─────────────────────────────────────────
create table if not exists public.ahorro_templates (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  presupuestado numeric(12,2) not null default 0,
  order_index integer not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.ahorro_templates enable row level security;

create policy "owner_all" on public.ahorro_templates
  for all using (auth.uid() = user_id);

-- ── user_profiles: pareja auto-calc fields ───────────────────
alter table public.user_profiles
  add column if not exists ingreso_oficial    numeric(12,2) not null default 0,
  add column if not exists pareja_ahorro_pct  numeric(5,2)  not null default 10,
  add column if not exists pareja_gastos_pct  numeric(5,2)  not null default 5;
