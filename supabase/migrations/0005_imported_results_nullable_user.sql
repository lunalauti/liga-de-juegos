-- Mismo criterio que D9 para groups.created_by (0004): "quién importó este link" es
-- historial, no debe bloquear el borrado de una cuenta. Sin esto, borrar un perfil
-- que alguna vez importó un resultado tira el mismo 500 de integridad referencial.
alter table public.imported_results alter column user_id drop not null;
alter table public.imported_results drop constraint imported_results_user_id_fkey;
alter table public.imported_results
  add constraint imported_results_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete set null;
