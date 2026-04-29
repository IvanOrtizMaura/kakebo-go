-- ============================================================
-- Migration 005: Add num_months to fondos_ahorro
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

alter table public.fondos_ahorro
  add column if not exists num_months integer not null default 11;

-- Back-fill existing records: recalculate monthly_amount based on num_months=11
update public.fondos_ahorro
  set monthly_amount = round(total_amount / 11, 2)
  where num_months = 11;
