#!/usr/bin/env node
// Consulta un resultado compartido de La Nación y lo normaliza al formato de la app.
// Uso: node tools/ln-shared.mjs <link-o-uuid> [...]   (ver specs/02-design.md §9)

const API = 'https://lanacion-api.agilmenteapp.com/api/games/shared/';

const GAMES = {
  'crossword/daily':  { slug: 'crucigrama',      name: 'Crucigrama',      penalty: 1200 },
  'crossword/expert': { slug: 'cruci-experto',   name: 'Cruci Experto',   penalty: 2400 },
  'sudoku/hard':      { slug: 'sudoku-avanzado', name: 'Sudoku Avanzado', penalty: 2700 },
};

export function extractId(input) {
  const m = String(input).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (!m) throw new Error(`No encontré un id en: ${input}`);
  return m[0].toLowerCase();
}

export async function fetchShared(input) {
  const id = extractId(input);
  const res = await fetch(API + id, {
    headers: {
      Accept: 'application/json, text/plain, */*',
      Origin: 'https://lanacion.agilmenteapp.com',
      Referer: 'https://lanacion.agilmenteapp.com/',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/151.0.0.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} para ${id}`);
  const raw = await res.json();
  if (raw.customer !== 'lanacion') throw new Error(`Resultado de otro diario: ${raw.customer}`);

  const key = `${raw.game}/${raw.level}`;
  const game = GAMES[key];
  return {
    external_id: raw.id,
    external_user_id: raw.user_id,
    puzzle_date: raw.date,
    ln_key: key,
    game_slug: game?.slug ?? null,
    game_name: game?.name ?? `(sin mapear: ${key})`,
    duration_seconds: raw.seconds,
    formatted: raw.formated_time,
    dnf: raw.result === 'FAIL',
    counts_as_seconds: raw.result === 'FAIL' ? (game?.penalty ?? null) : raw.seconds,
    points: raw.points,
    best_time: raw.best_time,
    player_name: raw.name,
  };
}

const args = process.argv.slice(2);
if (!args.length) {
  console.error('Uso: node tools/ln-shared.mjs <link-o-uuid> [...]');
  process.exit(1);
}
for (const a of args) {
  try {
    console.log(JSON.stringify(await fetchShared(a), null, 2));
  } catch (e) {
    console.error(`✗ ${a}: ${e.message}`);
    process.exitCode = 1;
  }
}
