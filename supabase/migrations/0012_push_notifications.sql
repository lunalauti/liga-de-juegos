-- T10.2/T10.6, specs/02-design.md §3.1/§10 — RF-21/RF-22.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Cada uno sólo puede ver/crear/borrar sus propias suscripciones (RNF-4).
-- No hace falta un policy de update: el flujo siempre es crear de nuevo
-- (on conflict do update, ver services/push.ts) o borrar, nunca un PATCH parcial.
create policy push_subscriptions_select_own on public.push_subscriptions
  for select using (auth.uid() = user_id);
create policy push_subscriptions_insert_own on public.push_subscriptions
  for insert with check (auth.uid() = user_id);
create policy push_subscriptions_delete_own on public.push_subscriptions
  for delete using (auth.uid() = user_id);

-- Qué aviso ya se mandó, para no duplicar si el cron corre dos veces el mismo
-- día (§3.1). `kind` deja lugar a otros tipos de aviso a futuro sin migrar de nuevo.
create table if not exists public.notification_log (
  user_id uuid not null references public.profiles(id) on delete cascade,
  puzzle_date date not null,
  kind text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, puzzle_date, kind)
);

alter table public.notification_log enable row level security;
-- Sin policies de lectura para usuarios comunes: esto lo escribe y lee sólo el
-- cron interno, con la service role key (que bypassea RLS) — no hay ninguna
-- ruta de la API pensada para que un jugador consulte esto.
