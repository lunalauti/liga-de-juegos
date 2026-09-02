import { buildGrid, type ResolvedCell } from './grid.js';
import { pickDroppedDays } from './dropWorst.js';
import type { GameRanking, LeaderboardRow, ScoringGame, ScoringInput, ScoringMember } from './types.js';

/**
 * Modo `position_points` (specs/02-design.md §5.2, RF-13). Igual que `total_time`
 * (scoring/totalTime.ts): un ranking independiente por juego, sin ningún total
 * cruzado entre juegos (D2). La diferencia es la unidad — acá se suman PUNTOS por
 * posición diaria, no segundos, y el orden es descendente.
 *
 * `pointsTable[i]` son los puntos para el puesto `i + 1` del día (RF-13, ej.
 * `[5, 3, 2, 1]` → 1º 5 pts, 2º 3 pts, 3º 2 pts, 4º 1 pt, 5º en adelante 0).
 */
export function scorePositionPoints(input: ScoringInput, pointsTable: number[]): { rankings: GameRanking[] } {
  const grid = buildGrid({
    members: input.members,
    games: input.games,
    days: input.days,
    entries: input.entries,
    blackouts: input.blackouts,
    absencePolicy: input.settings.absencePolicy,
    today: input.today,
  });

  const rankings = input.games.map((game) =>
    scoreGamePoints(game, input.members, grid, input.settings.dropWorstN, pointsTable),
  );
  return { rankings };
}

function scoreGamePoints(
  game: ScoringGame,
  members: ScoringMember[],
  grid: ResolvedCell[],
  dropWorstN: number,
  pointsTable: number[],
): GameRanking {
  const gameCells = grid.filter((c) => c.gameSlug === game.slug);
  const pointsByUserDay = computeDailyPoints(gameCells, pointsTable);

  const dailyWinsByUser = new Map<string, number>();
  for (const [, byUser] of pointsByUserDay) {
    const bestPoints = Math.max(...[...byUser.values()]);
    if (bestPoints <= 0) continue; // nadie completó el día (todo DNF/ausente): no hay "victoria"
    for (const [userId, pts] of byUser) if (pts === bestPoints) dailyWinsByUser.set(userId, (dailyWinsByUser.get(userId) ?? 0) + 1);
  }

  const rows = members.map((member) => buildRow(member, gameCells, pointsByUserDay, dropWorstN));
  for (const row of rows) row.dailyWins = dailyWinsByUser.get(row.userId) ?? 0;

  const ranked = rows.filter((r) => r.points !== null).sort(compareRows);
  const unranked = rows.filter((r) => r.points === null).sort((a, b) => a.displayName.localeCompare(b.displayName, 'es'));

  // Mismo ranking de competición estándar que total_time (T4b.8): un empate real
  // en puntos Y en tiempo total comparte posición, marcado `tied` — el alfabético
  // sólo ordena el listado, nunca decide quién queda 1º.
  ranked.forEach((r, i) => {
    const prev = ranked[i - 1];
    const tiedWithPrev = i > 0 && prev !== undefined && rowsAreTied(prev, r);
    r.rank = tiedWithPrev ? prev!.rank : i + 1;
    if (tiedWithPrev) {
      r.tied = true;
      prev!.tied = true;
    }
  });
  unranked.forEach((r, i) => (r.rank = ranked.length + i + 1));

  return { gameSlug: game.slug, gameName: game.name, rows: [...ranked, ...unranked] };
}

/**
 * RF-13: por día, ordenar ascendente por tiempo y repartir `pointsTable[i]`.
 * DNF y ausentes quedan últimos y suman 0 — participan del reparto (ocupan un
 * puesto) pero nunca puntúan.
 */
function computeDailyPoints(gameCells: ResolvedCell[], pointsTable: number[]): Map<string, Map<string, number>> {
  const byDay = new Map<string, ResolvedCell[]>();
  for (const c of gameCells) {
    const list = byDay.get(c.puzzleDate) ?? [];
    list.push(c);
    byDay.set(c.puzzleDate, list);
  }

  const result = new Map<string, Map<string, number>>();
  for (const [puzzleDate, cells] of byDay) {
    const finished = cells.filter((c) => c.source === 'entry' && !c.dnf).sort((a, b) => a.seconds - b.seconds);
    const notFinished = cells.filter((c) => c.source !== 'entry' || c.dnf); // DNF y ausencia penalizada

    const byUser = new Map<string, number>();
    finished.forEach((c, i) => byUser.set(c.userId, pointsTable[i] ?? 0));
    for (const c of notFinished) byUser.set(c.userId, 0);
    result.set(puzzleDate, byUser);
  }
  return result;
}

function buildRow(
  member: ScoringMember,
  gameCells: ResolvedCell[],
  pointsByUserDay: Map<string, Map<string, number>>,
  dropWorstN: number,
): LeaderboardRow {
  const mine = gameCells.filter((c) => c.userId === member.userId);
  const participated = mine.length > 0;

  const entryCells = mine.filter((c) => c.source === 'entry');
  const verifiedTotal = entryCells.length;
  const verifiedCount = entryCells.filter((c) => c.verified).length;

  if (!participated) {
    return {
      userId: member.userId,
      displayName: member.displayName,
      avatar: member.avatar,
      rank: null,
      tied: false,
      points: null,
      totalSeconds: null,
      avgSeconds: null,
      bestSeconds: null,
      daysPlayed: 0,
      dnfCount: 0,
      dailyWins: 0,
      droppedDays: [],
      verifiedCount,
      verifiedTotal,
    };
  }

  // "Peor día" en puntos es el de MENOS puntos, al revés que en tiempo. pickDroppedDays
  // descarta los N valores más ALTOS de `seconds` — negamos los puntos para que "más
  // puntos" (mejor día) quede como el valor más bajo, y así sobreviva al descarte.
  const dropped = pickDroppedDays(
    mine.map((c) => ({ puzzleDate: c.puzzleDate, seconds: -(pointsByUserDay.get(c.puzzleDate)?.get(member.userId) ?? 0) })),
    dropWorstN,
  );

  const kept = mine.filter((c) => !dropped.has(c.puzzleDate));
  const points = kept.reduce((s, c) => s + (pointsByUserDay.get(c.puzzleDate)?.get(member.userId) ?? 0), 0);
  const totalSeconds = kept.reduce((s, c) => s + c.seconds, 0);
  const daysPlayed = kept.filter((c) => c.source === 'entry').length;
  const dnfCount = kept.filter((c) => c.source === 'entry' && c.dnf).length;
  const nonDnfSeconds = kept.filter((c) => c.source === 'entry' && !c.dnf).map((c) => c.seconds);
  const bestSeconds = nonDnfSeconds.length > 0 ? Math.min(...nonDnfSeconds) : null;
  const avgSeconds = kept.length > 0 ? Math.round(totalSeconds / kept.length) : null;

  return {
    userId: member.userId,
    displayName: member.displayName,
    avatar: member.avatar,
    rank: null, // se asigna después de ordenar
    tied: false, // se completa afuera si corresponde
    points,
    totalSeconds,
    avgSeconds,
    bestSeconds,
    daysPlayed,
    dnfCount,
    dailyWins: 0, // se completa afuera con dailyWinsByUser
    droppedDays: [...dropped].sort(),
    verifiedCount,
    verifiedTotal,
  };
}

/** §5.2: puntos descendente; empate en puntos → tiempo total ascendente. */
function compareRows(a: LeaderboardRow, b: LeaderboardRow): number {
  const pointsA = a.points ?? 0;
  const pointsB = b.points ?? 0;
  if (pointsA !== pointsB) return pointsB - pointsA;
  const totalA = a.totalSeconds ?? Infinity;
  const totalB = b.totalSeconds ?? Infinity;
  if (totalA !== totalB) return totalA - totalB;
  return a.displayName.localeCompare(b.displayName, 'es');
}

/** Empate real: mismos puntos Y mismo tiempo total — el alfabético no cuenta (mismo criterio que T4b.8). */
function rowsAreTied(a: LeaderboardRow, b: LeaderboardRow): boolean {
  return a.points === b.points && a.totalSeconds === b.totalSeconds;
}
