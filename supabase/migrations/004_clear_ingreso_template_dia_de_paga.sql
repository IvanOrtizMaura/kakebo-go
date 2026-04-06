-- Migration 002: create ingreso_templates table if it doesn't exist yet.
create table if not exists public.ingreso_templates (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  fuente      text not null,
  esperado    numeric(10,2) not null default 0,
  dia_de_paga date null,
  order_index int not null default 0,
  created_at  timestamptz default now()
);

alter table public.ingreso_templates enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'ingreso_templates' and policyname = 'owner_all'
  ) then
    execute 'create policy "owner_all" on public.ingreso_templates for all using (auth.uid() = user_id)';
  end if;
end $$;

-- Migration 004: clear dia_de_paga from all existing templates.
-- The payment date is now entered per month in the monthly view.
update public.ingreso_templates
set dia_de_paga = null
where dia_de_paga is not null;
