-- ============================================================
-- Migration 006: Tables added after the Firestore migration
--   - inversiones (gold holdings)
--   - pensiones_aportaciones (pension contributions)
--   - extra columns on gastos and user_profiles
-- ============================================================

-- ── inversiones ──────────────────────────────────────────────
create table if not exists public.inversiones (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  gramos        numeric(10,4) not null default 0,
  pureza        numeric(10,4) not null default 0,
  precio_compra numeric(12,2) not null default 0,
  fecha_compra  date,
  created_at    timestamptz not null default now()
);

alter table public.inversiones enable row level security;
create policy "owner_all" on public.inversiones
  for all using (auth.uid() = user_id);

-- ── pensiones_aportaciones ────────────────────────────────────
create table if not exists public.pensiones_aportaciones (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  fecha      date not null,
  importe    numeric(12,2) not null default 0,
  nota       text,
  created_at timestamptz not null default now()
);

alter table public.pensiones_aportaciones enable row level security;
create policy "owner_all" on public.pensiones_aportaciones
  for all using (auth.uid() = user_id);

-- ── gastos: extra fields used in native inversiones flow ──────
alter table public.gastos
  add column if not exists nombre    text,
  add column if not exists importe   numeric(12,2),
  add column if not exists categoria text,
  add column if not exists pagado    boolean not null default false;

-- ── telegram integration (for future bot) ────────────────────
alter table public.user_profiles
  add column if not exists telegram_chat_id bigint;
