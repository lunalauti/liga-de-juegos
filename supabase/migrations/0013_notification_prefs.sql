-- T11.1, specs/02-design.md §3.1/§10.7 — RF-22/RF-23/RF-24, D13.
-- Tres avisos independientes, cada uno con su propio apagado/prendido. El
-- default preserva el comportamiento actual para quien ya estaba suscripto
-- (pendingToday = true) y deja los dos avisos nuevos apagados para todo el
-- mundo hasta que alguien los prenda a mano (RNF-9, opt-in real).
alter table public.profiles
  add column if not exists notification_prefs jsonb not null default '{"pendingToday": true, "teammateActivity": false, "newMember": false}';
