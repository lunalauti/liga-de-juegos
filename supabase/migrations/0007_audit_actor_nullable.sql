-- Mismo criterio que 0004 (D9) y 0005: entry_audit.actor_id sin ON DELETE bloqueaba
-- el borrado de CUALQUIER cuenta que alguna vez haya cargado o editado un resultado
-- — prácticamente todo el mundo. "Quién hizo esto" es historial, no debe impedir
-- que la cuenta se borre.
alter table public.entry_audit alter column actor_id drop not null;
alter table public.entry_audit drop constraint entry_audit_actor_id_fkey;
alter table public.entry_audit
  add constraint entry_audit_actor_id_fkey
  foreign key (actor_id) references public.profiles(id) on delete set null;
