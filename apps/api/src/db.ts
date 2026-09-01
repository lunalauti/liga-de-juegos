import pg from 'pg';

/**
 * Por default, `pg` parsea la columna `date` (OID 1082) a un `Date` de JS usando
 * la zona horaria del PROCESO, no UTC. Funciona "de casualidad" en una máquina en
 * Argentina y se corre un día en un servidor con TZ=UTC (Render). `puzzle_date` es
 * una fecha pura, nunca un instante (specs/02-design.md §5.5) — se deja tal cual
 * viene de Postgres, como string `YYYY-MM-DD`.
 */
pg.types.setTypeParser(1082, (value) => value);

/**
 * Acceso a datos por SQL a mano (specs/02-design.md §2): los rankings son analíticos
 * y un ORM estorbaría. Un único Pool para toda la API.
 */
const connectionString = process.env['DATABASE_URL'];
if (!connectionString) {
  console.warn('[db] falta DATABASE_URL — las rutas que consultan la base van a fallar');
}

export const db = new pg.Pool({
  connectionString,
  ssl: connectionString ? { rejectUnauthorized: false } : undefined,
  max: 5,
});
