-- Ingreso templates: recurring income sources defined once in Settings,
-- auto-copied to new months when the user first opens them.

create table if not exists ingreso_templates (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  fuente     text not null,
  esperado   numeric(10,2) not null default 0,
  dia_de_paga date null,
  order_index int not null default 0,
  created_at  timestamptz default now()
);

alter table ingreso_templates enable row level security;

create policy "owner_all" on ingreso_templates
  for all using (auth.uid() = user_id);
