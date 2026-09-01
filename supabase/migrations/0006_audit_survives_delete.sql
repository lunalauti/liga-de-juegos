-- entry_audit.entry_id tenía on delete cascade: borrar un resultado se llevaba puesto
-- su propio log de auditoría, justo el registro que RF-9 pide conservar ("quién editó
-- qué y cuándo", visible para el grupo). El antes/después ya vive completo en el jsonb
-- de cada fila; el vínculo a `entries` es de conveniencia mientras la fila exista, no
-- una condición para que el log sobreviva.
alter table public.entry_audit alter column entry_id drop not null;
alter table public.entry_audit drop constraint entry_audit_entry_id_fkey;
alter table public.entry_audit
  add constraint entry_audit_entry_id_fkey
  foreign key (entry_id) references public.entries(id) on delete set null;
