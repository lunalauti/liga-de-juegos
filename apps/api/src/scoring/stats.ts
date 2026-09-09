import { addDays, daysBetween } from '@liga/shared';

/** Tipos del motor de estadísticas (RF-14, RF-19, specs/02-design.md §5.3). Todo scopeado a UN jugador. */
export interface StatsEntry {
  gameSlug: string;
  puzzleDate: string;
  durationSeconds: number;
  dnf: boolean;
  verified: boolean;
}

export interface StatsGame {
  slug: string;
  name: string;
}

export interface StatsInput {
  games: StatsGame[]; // juegos activos del grupo
  /** TODAS las entries del jugador en el grupo, sin recortar a un período — racha y PB son históricos. */
  entries: StatsEntry[];
  today: string; // ART
  currentPeriod: { start: string; end: string };
  previousPeriod: { start: string; end: string };
}

export interface GameStats {
  gameSlug: string;
  gameName: string;
  /** Mejor tiempo histórico, en segundos — `null` si nunca completó ese juego. */
  personalBest: number | null;
  /** Desvío estándar poblacional de los tiempos no-DNF de la temporada en curso, en segundos. */
  consistency: number | null;
  /** `entries no-DNF / (días × juegos activos)` de la temporada en curso, 0–1. */
  completion: number;
  /** Promedio de esta temporada − promedio de la anterior, en segundos. Negativo = mejoró. `null` sin datos en algún lado. */
  trend: number | null;
  verifiedCount: number;
  verifiedTotal: number;
}

export interface Stats {
  currentStreak: number;
  bestStreak: number;
  games: GameStats[];
}

/**
 * RF-14 §5.3. Puro: nada de fechas implícitas, todo entra por parámetro — mismo
 * principio que scoring/totalTime.ts.
 */
export function computeStats(input: StatsInput): Stats {
  const { currentStreak, bestStreak } = computeStreaks(input.entries, input.games, input.today);
  const games = input.games.map((g) => computeGameStats(g, input.entries, input.currentPeriod, input.previousPeriod));
  return { currentStreak, bestStreak, games };
}

/** Agrupa por día → lista de entries de ese día, para no recorrer todo el array por cada consulta de un día. */
function groupByDay(entries: StatsEntry[]): Map<string, StatsEntry[]> {
  const byDay = new Map<string, StatsEntry[]>();
  for (const e of entries) {
    const list = byDay.get(e.puzzleDate) ?? [];
    list.push(e);
    byDay.set(e.puzzleDate, list);
  }
  return byDay;
}

/** "Completó TODOS los juegos activos ese día, sin DNF" — la racha es holística (D11), no por juego. */
function isDayComplete(day: string, games: StatsGame[], byDay: Map<string, StatsEntry[]>): boolean {
  const dayEntries = byDay.get(day) ?? [];
  if (dayEntries.length < games.length) return false;
  const bySlug = new Map(dayEntries.map((e) => [e.gameSlug, e]));
  return games.every((g) => bySlug.get(g.slug) && !bySlug.get(g.slug)!.dnf);
}

/**
 * RF-14 "Racha": días consecutivos con todos los juegos activos completados sin
 * DNF. El día en curso (`today`) nunca cuenta EN CONTRA — mismo principio que
 * RF-8 en el motor de puntuación (buildGrid): un día que todavía no cerró no
 * puede cortar una racha. Si ya está completo, sí suma; si está a medias o
 * vacío, el conteo arranca en ayer sin penalizar a quien todavía no cargó.
 */
function computeStreaks(entries: StatsEntry[], games: StatsGame[], today: string): { currentStreak: number; bestStreak: number } {
  if (games.length === 0) return { currentStreak: 0, bestStreak: 0 };
  const byDay = groupByDay(entries);

  let currentStreak = 0;
  let cursor = today;
  if (isDayComplete(today, games, byDay)) {
    currentStreak = 1;
    cursor = addDays(today, -1);
  } else {
    cursor = addDays(today, -1);
  }
  while (isDayComplete(cursor, games, byDay)) {
    currentStreak += 1;
    cursor = addDays(cursor, -1);
  }

  // Mejor racha histórica: recorre todos los días desde la primera entry hasta
  // hoy y busca la corrida más larga de días completos. A diferencia de la
  // racha actual, acá "hoy" no necesita tratamiento especial: si está
  // incompleto simplemente no extiende ninguna corrida, no rompe nada (las
  // corridas pasadas ya quedaron contadas al llegar a ellas en el recorrido).
  const days = [...entries.map((e) => e.puzzleDate)].sort();
  let bestStreak = 0;
  if (days.length > 0) {
    let run = 0;
    let day = days[0]!;
    while (day <= today) {
      if (isDayComplete(day, games, byDay)) {
        run += 1;
        bestStreak = Math.max(bestStreak, run);
      } else {
        run = 0;
      }
      day = addDays(day, 1);
    }
  }
  bestStreak = Math.max(bestStreak, currentStreak);

  return { currentStreak, bestStreak };
}

function stdDevPopulation(values: number[]): number | null {
  if (values.length === 0) return null;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function computeGameStats(
  game: StatsGame,
  allEntries: StatsEntry[],
  currentPeriod: { start: string; end: string },
  previousPeriod: { start: string; end: string },
): GameStats {
  const gameEntries = allEntries.filter((e) => e.gameSlug === game.slug);
  const nonDnf = gameEntries.filter((e) => !e.dnf);

  // Ojo: esto es el mínimo de las `allEntries` que le pasen — si son las de UN
  // grupo, da un PB de ese grupo. RF-14 lo quiere GLOBAL por jugador (el índice
  // entries_pb_idx, §3.3, es user_id+game_id, sin group_id): routes/stats.ts pisa
  // este valor con una consulta propia entre todos los grupos del jugador.
  const personalBest = nonDnf.length > 0 ? Math.min(...nonDnf.map((e) => e.durationSeconds)) : null;

  const inCurrent = gameEntries.filter((e) => e.puzzleDate >= currentPeriod.start && e.puzzleDate <= currentPeriod.end);
  const currentNonDnf = inCurrent.filter((e) => !e.dnf);
  const consistency = stdDevPopulation(currentNonDnf.map((e) => e.durationSeconds));

  const daysInPeriod = daysBetween(currentPeriod.start, currentPeriod.end) + 1;
  const completion = daysInPeriod > 0 ? currentNonDnf.length / daysInPeriod : 0;

  const inPrevious = gameEntries.filter((e) => e.puzzleDate >= previousPeriod.start && e.puzzleDate <= previousPeriod.end && !e.dnf);
  const currentAvg = average(currentNonDnf.map((e) => e.durationSeconds));
  const previousAvg = average(inPrevious.map((e) => e.durationSeconds));
  const trend = currentAvg !== null && previousAvg !== null ? currentAvg - previousAvg : null;

  return {
    gameSlug: game.slug,
    gameName: game.name,
    personalBest,
    consistency,
    completion,
    trend,
    verifiedCount: gameEntries.filter((e) => e.verified).length,
    verifiedTotal: gameEntries.length,
  };
}
