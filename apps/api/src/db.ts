import pg from 'pg';

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
