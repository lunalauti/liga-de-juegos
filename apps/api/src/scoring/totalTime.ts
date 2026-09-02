import { buildGrid, type ResolvedCell } from './grid.js';
import { pickDroppedDays } from './dropWorst.js';
import type { DailyWinner, GameRanking, LeaderboardRow, ScoringInput, ScoringGame, ScoringMember } from './types.js';

/**
 * Modo `total_time` (specs/02-design.md §5.1). Puro: mismos parámetros, mismo
 * resultado, siempre — es la parte del sistema donde un bug se nota en el chat
 * del grupo antes que en cualquier test.
 *
 * Cambio de alcance (D2, 2026-09-01): ya no arma UNA tabla sumando los tiempos
 * de todos los juegos activos — arma una tabla independiente por juego, sin
 * ningún total cruzado entre juegos. `buildGrid` no cambia; lo que cambia es que
 * cada juego se rankea por separado a partir de su propio subconjunto de celdas.
 */
export function scoreTotalTime(input: ScoringInput): { rankings: GameRanking[] } {
  const grid = buildGrid({
    members: input.members,
    games: input.games,
    days: input.days,
    entries: input.entries,
    blackouts: input.blackouts,
    absencePolicy: input.settings.absencePolicy,
    today: input.today,
  });

  const rankings = input.games.map((game) => scoreGame(game, input.members, grid, input.settings.dropWorstN));
  return { rankings };
}

function scoreGame(game: ScoringGame, members: ScoringMember[], grid: ResolvedCell[], dropWorstN: number): GameRanking {
  const gameCells = grid.filter((c) => c.gameSlug === game.slug);

  const dailyWinners = computeDailyWinners(gameCells);
  const winsByUser = new Map<string, number>();
  for (const w of dailyWinners) winsByUser.set(w.userId, (winsByUser.get(w.userId) ?? 0) + 1);

  const rows = members.map((member) => buildRow(member, gameCells, dropWorstN));
  for (const row of rows) row.dailyWins = winsByUser.get(row.userId) ?? 0;

  const ranked = rows.filter((r) => r.totalSeconds !== null).sort(compareRows);
  const unranked = rows.filter((r) => r.totalSeconds === null).sort((a, b) => a.displayName.localeCompare(b.displayName, 'es'));

  // Ranking de competición estándar (1, 1, 3 — no 1, 2, 3): dos filas con
  // exactamente los mismos criterios reales (RF-15, sin contar el alfabético,
  // que sólo decide el orden de listado) comparten posición y quedan marcadas
  // `tied`. El alfabético nunca inventa un 1º y un 2º donde hay un empate real.
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

function buildRow(member: ScoringMember, gameCells: ResolvedCell[], dropWorstN: number): LeaderboardRow {
  const mine = gameCells.filter((c) => c.userId === member.userId);
  // Con absence_policy "penalize", buildGrid le arma una celda a TODO el mundo en
  // TODO día de este juego (aunque sea de ausencia) — nunca queda sin ninguna celda,
  // y su inactividad ya se refleja sola en un total enorme (RF-8). Con "ignore",
  // quien nunca cargó nada literalmente no tiene ninguna celda: ahí sí no participó.
  const participated = mine.length > 0;

  // Verificado: estadística de integridad, se mide sobre TODO el período, no
  // sobre lo que sobrevive al descarte de peores tiempos.
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

  // Un solo juego → como mucho una celda por día, así que la lista de "totales
  // diarios" que pide pickDroppedDays es directamente el valor de cada celda.
  const dropped = pickDroppedDays(
    mine.map((c) => ({ puzzleDate: c.puzzleDate, seconds: c.seconds })),
    dropWorstN,
  );

  const kept = mine.filter((c) => !dropped.has(c.puzzleDate));
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
    points: null,
    totalSeconds,
    avgSeconds,
    bestSeconds,
    daysPlayed,
    dnfCount,
    dailyWins: 0, // se completa afuera con computeDailyWinners
    droppedDays: [...dropped].sort(),
    verifiedCount,
    verifiedTotal,
  };
}

/**
 * RF-12: gana el día, en este juego, quien tenga menos tiempo ese día. D2 quitó la
 * necesidad de exigir "día completo" (los 3 juegos cargados) para poder ganar —
 * eso sólo hacía falta cuando se comparaba la SUMA del día entre jugadores; acá
 * sólo se compara un juego contra sí mismo.
 */
function computeDailyWinners(gameCells: ResolvedCell[]): DailyWinner[] {
  const byDay = new Map<string, ResolvedCell[]>();
  for (const c of gameCells) {
    const list = byDay.get(c.puzzleDate) ?? [];
    list.push(c);
    byDay.set(c.puzzleDate, list);
  }

  const winners: DailyWinner[] = [];
  for (const [puzzleDate, cells] of byDay) {
    let best: ResolvedCell[] = [];
    for (const c of cells) {
      if (best.length === 0 || c.seconds < best[0]!.seconds) best = [c];
      else if (c.seconds === best[0]!.seconds) best.push(c);
    }
    for (const w of best) winners.push({ puzzleDate, userId: w.userId, seconds: w.seconds });
  }

  return winners;
}

/** RF-15: victorias diarias ↓, DNF ↑, mejor tiempo individual ↑, alfabético — todo dentro de un solo juego. */
function compareRows(a: LeaderboardRow, b: LeaderboardRow): number {
  if (a.dailyWins !== b.dailyWins) return b.dailyWins - a.dailyWins;
  if (a.dnfCount !== b.dnfCount) return a.dnfCount - b.dnfCount;
  const bestA = a.bestSeconds ?? Infinity;
  const bestB = b.bestSeconds ?? Infinity;
  if (bestA !== bestB) return bestA - bestB;
  return a.displayName.localeCompare(b.displayName, 'es');
}

/**
 * Empate real: los 3 criterios de desempate de RF-15 (además del total, que ya
 * es igual porque `ranked` está agrupado por `compareRows`) coinciden. El
 * alfabético NO cuenta acá — es el único criterio que siempre "decide" algo,
 * y por eso mismo es el que no puede convertir un empate real en un 1º y un 2º.
 */
function rowsAreTied(a: LeaderboardRow, b: LeaderboardRow): boolean {
  return (
    a.totalSeconds === b.totalSeconds &&
    a.dailyWins === b.dailyWins &&
    a.dnfCount === b.dnfCount &&
    a.bestSeconds === b.bestSeconds
  );
}
