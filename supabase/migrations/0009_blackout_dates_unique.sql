-- D6/T6.5: evita blackouts duplicados para el mismo grupo+fecha+juego. `game_id`
-- puede ser null ("todo el día"), así que son dos índices parciales en vez de un
-- unique constraint común — Postgres no distingue NULLs como iguales por default,
-- y acá sí queremos que "el mismo día completo" cargado dos veces choque.
create unique index blackout_dates_group_date_game_uidx
  on public.blackout_dates (group_id, puzzle_date, game_id)
  where game_id is not null;

create unique index blackout_dates_group_date_all_uidx
  on public.blackout_dates (group_id, puzzle_date)
  where game_id is null;
