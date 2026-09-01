-- RLS como segunda barrera (RNF-4). La API usa la service_role key y aplica la
-- autorización ella misma; esto protege si alguna vez algo pega desde el cliente.
-- Ver specs/02-design.md §3.4.

create function public.is_member(p_group_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid()
  );
$$;

create function public.is_admin(p_group_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid() and role = 'admin'
  );
$$;

alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_games enable row level security;
alter table public.entries enable row level security;
alter table public.entry_audit enable row level security;
alter table public.imported_results enable row level security;
alter table public.seasons enable row level security;
alter table public.blackout_dates enable row level security;

-- profiles: verse a uno mismo y a quien comparte grupo; escribirse sólo a uno mismo.
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or exists (
    select 1 from public.group_members gm1
    join public.group_members gm2 on gm1.group_id = gm2.group_id
    where gm1.user_id = auth.uid() and gm2.user_id = profiles.id
  ));
create policy profiles_update on public.profiles for update
  using (id = auth.uid());

-- games: catálogo público de lectura.
create policy games_select on public.games for select using (true);

-- groups: sólo miembros.
create policy groups_select on public.groups for select using (public.is_member(id));
create policy groups_update on public.groups for update using (public.is_admin(id));
create policy groups_insert on public.groups for insert with check (created_by = auth.uid());

create policy group_members_select on public.group_members for select using (public.is_member(group_id));
create policy group_members_admin_write on public.group_members for all
  using (public.is_admin(group_id)) with check (public.is_admin(group_id));
-- unirse a un grupo: el propio usuario se agrega a sí mismo (el código lo valida la API).
create policy group_members_self_insert on public.group_members for insert
  with check (user_id = auth.uid());

create policy group_games_select on public.group_games for select using (public.is_member(group_id));
create policy group_games_admin_write on public.group_games for all
  using (public.is_admin(group_id)) with check (public.is_admin(group_id));

-- entries: lectura para todo el grupo; escritura sólo de lo propio (RF-9 lo acota
-- además por ventana de tiempo, eso lo aplica la API — RLS no conoce settings del grupo).
create policy entries_select on public.entries for select using (public.is_member(group_id));
create policy entries_write_own on public.entries for all
  using (user_id = auth.uid() and public.is_member(group_id))
  with check (user_id = auth.uid() and public.is_member(group_id));
create policy entries_admin_write on public.entries for all
  using (public.is_admin(group_id)) with check (public.is_admin(group_id));

create policy entry_audit_select on public.entry_audit for select using (
  exists (select 1 from public.entries e where e.id = entry_audit.entry_id and public.is_member(e.group_id))
);

create policy imported_results_select on public.imported_results for select using (user_id = auth.uid());

create policy seasons_select on public.seasons for select using (public.is_member(group_id));
create policy blackout_select on public.blackout_dates for select using (public.is_member(group_id));
create policy blackout_admin_write on public.blackout_dates for all
  using (public.is_admin(group_id)) with check (public.is_admin(group_id));
