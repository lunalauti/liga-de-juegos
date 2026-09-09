-- Deuda técnica: `profiles.lanacion_user_ids` quedó sin uso después del fix
-- de resolveLnVerification (T3.13, 0010_fix_verified_lanacion_entries.sql) —
-- se creó para "recordar" el user_id que devuelve un link de La Nación y
-- compararlo contra los siguientes, pero ese id resultó no ser estable por
-- persona (distinto en cada link, incluso para la misma persona al día
-- siguiente), así que dejó de usarse por completo. Ver 02-design.md §9.4.
alter table public.profiles drop column if exists lanacion_user_ids;
