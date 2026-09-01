-- Liga de Juegos — esquema inicial. Ver specs/02-design.md §3.
-- Todos los ids son uuid, todos los timestamps timestamptz en UTC.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles — extiende auth.users
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 30),
  avatar text,
  lanacion_user_ids text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Se crea automáticamente al registrarse (T1.3).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- games — catálogo. Data, no enum (D5): agregar un juego es una fila, no un deploy.
-- ---------------------------------------------------------------------------
create table public.games (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  default_penalty_seconds int not null check (default_penalty_seconds > 0),
  ln_game text,
  ln_level text,
  sort_order int not null default 0,
  active bool not null default true
);

-- ---------------------------------------------------------------------------
-- groups
-- ---------------------------------------------------------------------------
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 60),
  invite_code text unique not null,
  created_by uuid not null references public.profiles(id),
  settings jsonb not null default '{
    "period_types": ["month", "week"],
    "primary_period": "month",
    "absence_policy": "penalize",
    "scoring_mode": "total_time",
    "position_points": [5, 3, 2, 1],
    "drop_worst_n": 0,
    "edit_window_hours": 48,
    "require_verified": false,
    "timezone": "America/Argentina/Buenos_Aires"
  }'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table public.group_games (
  group_id uuid not null references public.groups(id) on delete cascade,
  game_id uuid not null references public.games(id),
  penalty_seconds int not null check (penalty_seconds > 0),
  enabled bool not null default true,
  primary key (group_id, game_id)
);

-- ---------------------------------------------------------------------------
-- entries — el corazón del sistema. Ver specs/02-design.md §3.1 y §9.4.
-- ---------------------------------------------------------------------------
create table public.entries (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  game_id uuid not null references public.games(id),
  puzzle_date date not null,
  duration_seconds int not null check (duration_seconds > 0),
  dnf bool not null default false,
  source text not null default 'manual' check (source in ('lanacion_link', 'manual')),
  verified bool not null default false,
  external_id uuid,
  external_user_id text,
  external_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, user_id, game_id, puzzle_date)
);

create index entries_group_date_idx on public.entries (group_id, puzzle_date);
create index entries_group_user_date_idx on public.entries (group_id, user_id, puzzle_date);
create index entries_pb_idx on public.entries (user_id, game_id, duration_seconds) where dnf = false;
create index entries_external_id_idx on public.entries (external_id) where external_id is not null;

create table public.entry_audit (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.entries(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  action text not null check (action in ('create', 'update', 'delete')),
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

-- Un link de La Nación, una vez. La unicidad real es "un link, un jugador" (§9.4),
-- no "un link, un grupo" — por eso está separado de entries.
create table public.imported_results (
  external_id uuid primary key,
  user_id uuid not null references public.profiles(id),
  payload jsonb not null,
  imported_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- seasons
-- ---------------------------------------------------------------------------
create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  period_type text not null check (period_type in ('week', 'month')),
  starts_on date not null,
  ends_on date not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  rules_snapshot jsonb,
  final_standings jsonb,
  unique (group_id, period_type, starts_on)
);

create table public.blackout_dates (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  puzzle_date date not null,
  game_id uuid references public.games(id), -- null = todos los juegos ese día
  reason text,
  created_at timestamptz not null default now()
);

create function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_entries_updated_at
  before update on public.entries
  for each row execute function public.set_updated_at();
