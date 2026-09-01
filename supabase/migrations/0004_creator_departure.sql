-- D9 (specs/01-requirements.md §8): qué pasa con un grupo si alguien con rol admin
-- borra su cuenta. Decisión: el rol de admin pasa al miembro más antiguo que quede;
-- si no queda nadie más, el grupo se borra. Aplica a cualquier admin que se va, no
-- sólo al creador original — si no, el mismo problema reaparece cuando se va un
-- admin promovido más tarde.
--
-- Además: created_by pasaba a bloquear el borrado del perfil (RESTRICT implícito).
-- Un grupo puede seguir existiendo sin que su fundador exista más; created_by pasa
-- a ON DELETE SET NULL — es "quién lo creó" para historial, no una referencia viva.

alter table public.groups alter column created_by drop not null;
alter table public.groups drop constraint groups_created_by_fkey;
alter table public.groups
  add constraint groups_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

create function public.handle_admin_departure()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  g record;
  remaining_admins int;
  next_user_id uuid;
begin
  for g in select group_id from public.group_members where user_id = old.id and role = 'admin'
  loop
    select count(*) into remaining_admins
      from public.group_members
     where group_id = g.group_id and role = 'admin' and user_id <> old.id;

    if remaining_admins > 0 then
      continue; -- ya queda otro admin, no hace falta tocar nada
    end if;

    select user_id into next_user_id
      from public.group_members
     where group_id = g.group_id and user_id <> old.id
     order by joined_at
     limit 1;

    if next_user_id is null then
      delete from public.groups where id = g.group_id; -- nadie más: se borra el grupo
    else
      update public.group_members set role = 'admin'
       where group_id = g.group_id and user_id = next_user_id;
    end if;
  end loop;

  return old;
end;
$$;

create trigger on_profile_admin_departure
  before delete on public.profiles
  for each row execute function public.handle_admin_departure();
