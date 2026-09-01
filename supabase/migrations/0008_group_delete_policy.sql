-- Faltaba una policy de DELETE en public.groups (sólo había select/update/insert,
-- ver 0002_rls.sql). La API usa la service role key y bypassea RLS igual, pero la
-- dejamos correcta por si alguna vez se habilita acceso directo con el token del
-- usuario (specs/02-design.md §1).
create policy groups_delete on public.groups for delete using (public.is_admin(id));
