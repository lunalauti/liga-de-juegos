#!/usr/bin/env node
// Aplica supabase/migrations/*.sql en orden, dentro de una tabla de control simple.
// Uso: node apps/api/scripts/migrate.mjs
import 'dotenv/config';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', '..', '..', 'supabase', 'migrations');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Falta DATABASE_URL — cargala en .env (local) o como secreto en GitHub Actions (CI)');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

await client.query(`
  create table if not exists public._migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  );
`);

const applied = new Set(
  (await client.query('select name from public._migrations')).rows.map((r) => r.name),
);

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

for (const file of files) {
  if (applied.has(file)) {
    console.log(`= ${file} (ya aplicada)`);
    continue;
  }
  const sql = readFileSync(join(migrationsDir, file), 'utf8');
  console.log(`> aplicando ${file}...`);
  try {
    await client.query('begin');
    await client.query(sql);
    await client.query('insert into public._migrations (name) values ($1)', [file]);
    await client.query('commit');
    console.log(`✓ ${file}`);
  } catch (err) {
    await client.query('rollback');
    console.error(`✗ ${file} falló:`, err.message);
    await client.end();
    process.exit(1);
  }
}

await client.end();
console.log('Listo.');
