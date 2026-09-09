-- Corrección de datos, no de esquema: el bug de resolveLnVerification (T3.13,
-- ver services/entries.ts) dejó marcados como `verified = false` a TODOS los
-- resultados importados por link después del primero de cada persona, porque
-- el user_id que devuelve La Nación no es estable entre links (confirmado con
-- datos reales de producción, 2026-09-09). El link en sí siempre fue una
-- fuente confiable — sólo estaba mal la bandera. Se corrige retroactivamente.
update public.entries
   set verified = true
 where source = 'lanacion_link'
   and verified = false;
