import { buildGrid, type ResolvedCell } from './grid.js';
import { pickDroppedDays } from './dropWorst.js';
import type { DailyWinner, LeaderboardRow, ScoringInput, PerGameStats } from './types.js';

/**
 * Modo `total_time` (specs/02-design.md §5.1). Puro: mismos parámetros, mismo
 * resultado, siempre — es la parte del sistema donde un bug se nota en el chat
 * del grupo antes que en cualquier test.
 */
export function scoreTotalTime(input: ScoringInput): { rows: LeaderboardRow[]; dailyWinners: DailyWinner[] } {
  const grid = buildGrid({
    members: input.members,
    games: input.games,
    days: input.days,
    entries: input.entries,
    blackouts: input.blackouts,
    absencePolicy: input.settings.absencePolicy,
  });

  const dailyWinners = computeDailyWinners(grid, input.games.length);
  const winsByUser = new Map<string, number>();
  for (const w of dailyWinners) winsByUser.set(w.userId, (winsByUser.get(w.userId) ?? 0) + 1);

  const rows = input.members.map((member) => buildRow(member, grid, input.settings.dropWorstN));
  for (const row of rows) row.dailyWins = winsByUser.get(row.userId) ?? 0;

  const ranked = rows.filter((r) => r.totalSeconds !== null).sort(compareRows);
  const unranked = rows.filter((r) => r.totalSeconds === null).sort((a, b) => a.displayName.localeCompare(b.displayName, 'es'));

  ranked.forEach((r, i) => (r.rank = i + 1));
  unranked.forEach((r, i) => (r.rank = ranked.length + i + 1));

  return { rows: [...ranked, ...unranked], dailyWinners };
}

function buildRow(
  member: { userId: string; displayName: string; avatar: string | null },
  grid: ResolvedCell[],
  dropWorstN: number,
): LeaderboardRow {
  const mine = grid.filter((c) => c.userId === member.userId);
  // Con absence_policy "penalize", buildGrid le arma una celda a TODO el mundo en
  // TODO juego/día (aunque sea de ausencia) — nunca queda sin ninguna celda, y su
  // inactividad ya se refleja sola en un total enorme (RF-8). Con "ignore", quien
  // nunca cargó nada literalmente no tiene ninguna celda: ahí sí no participó.
  const participated = mine.length > 0;

  // Verificado: estadística de integridad, se mide sobre TODO el período, no
  // sobre lo que sobrevive al descarte de peores días.
  const entryCells = mine.filter((c) => c.source === 'entry');
  const verifiedTotal = entryCells.length;
  const verifiedCount = entryCells.filter((c) => c.verified).length;

  if (!participated) {
    return {
      userId: member.userId,
      displayName: member.displayName,
      avatar: member.avatar,
      rank: null,
      totalSeconds: null,
      perGame: {},
      daysPlayed: 0,
      dnfCount: 0,
      dailyWins: 0,
      droppedDays: [],
      verifiedCount,
      verifiedTotal,
    };
  }

  const byDay = new Map<string, ResolvedCell[]>();
  for (const c of mine) {
    const list = byDay.get(c.puzzleDate) ?? [];
    list.push(c);
    byDay.set(c.puzzleDate, list);
  }
  const dailyTotals = [...byDay.entries()].map(([puzzleDate, cells]) => ({
    puzzleDate,
    seconds: cells.reduce((s, c) => s + c.seconds, 0),
  }));
  const dropped = pickDroppedDays(dailyTotals, dropWorstN);

  const kept = mine.filter((c) => !dropped.has(c.puzzleDate));
  const totalSeconds = kept.reduce((s, c) => s + c.seconds, 0);
  const daysPlayed = new Set(kept.filter((c) => c.source === 'entry').map((c) => c.puzzleDate)).size;
  const dnfCount = kept.filter((c) => c.source === 'entry' && c.dnf).length;

  const perGame: Record<string, PerGameStats> = {};
  for (const c of kept) {
    const g = (perGame[c.gameSlug] ??= { total: 0, avg: 0, best: null, dnf: 0 });
    g.total += c.seconds;
    if (c.source === 'entry' && c.dnf) g.dnf += 1;
    if (c.source === 'entry' && !c.dnf) g.best = g.best === null ? c.seconds : Math.min(g.best, c.seconds);
  }
  for (const [slug, cells] of groupBy(kept, (c) => c.gameSlug)) {
    perGame[slug]!.avg = Math.round(perGame[slug]!.total / cells.length);
  }

  return {
    userId: member.userId,
    displayName: member.displayName,
    avatar: member.avatar,
    rank: null, // se asigna después de ordenar
    totalSeconds,
    perGame,
    daysPlayed,
    dnfCount,
    dailyWins: 0, // se completa afuera con computeDailyWinners
    droppedDays: [...dropped].sort(),
    verifiedCount,
    verifiedTotal,
  };
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k) ?? [];
    list.push(item);
    map.set(k, list);
  }
  return map;
}

/**
 * RF-12: gana el día quien tenga menos tiempo total, "entre quienes tienen el
 * día completo" — con `absence_policy: "ignore"`, a alguien le puede faltar una
 * celda entera y queda afuera de la comparación de ese día.
 */
function computeDailyWinners(grid: ResolvedCell[], activeGameCount: number): DailyWinner[] {
  const byDayUser = new Map<string, Map<string, ResolvedCell[]>>();
  for (const c of grid) {
    const byUser = byDayUser.get(c.puzzleDate) ?? new Map<string, ResolvedCell[]>();
    const list = byUser.get(c.userId) ?? [];
    list.push(c);
    byUser.set(c.userId, list);
    byDayUser.set(c.puzzleDate, byUser);
  }

  const winners: DailyWinner[] = [];
  for (const [puzzleDate, byUser] of byDayUser) {
    let best: { userId: string; seconds: number }[] = [];
    for (const [userId, cells] of byUser) {
      if (cells.length < activeGameCount) continue; // día incompleto para esta persona
      const seconds = cells.reduce((s, c) => s + c.seconds, 0);
      if (best.length === 0 || seconds < best[0]!.seconds) best = [{ userId, seconds }];
      else if (seconds === best[0]!.seconds) best.push({ userId, seconds });
    }
    for (const w of best) winners.push({ puzzleDate, userId: w.userId, totalSeconds: w.seconds });
  }

  // dailyWins por usuario, mutando las rows fue tentador pero esto se queda puro:
  // el caller (scoreTotalTime) usa `winners` para completar `dailyWins` de cada fila.
  return winners;
}

/** RF-15: victorias diarias ↓, DNF ↑, mejor tiempo individual ↑, alfabético. */
function compareRows(a: LeaderboardRow, b: LeaderboardRow): number {
  if (a.dailyWins !== b.dailyWins) return b.dailyWins - a.dailyWins;
  if (a.dnfCount !== b.dnfCount) return a.dnfCount - b.dnfCount;
  const bestA = bestIndividualTime(a);
  const bestB = bestIndividualTime(b);
  if (bestA !== bestB) return bestA - bestB;
  return a.displayName.localeCompare(b.displayName, 'es');
}

function bestIndividualTime(row: LeaderboardRow): number {
  const bests = Object.values(row.perGame)
    .map((g) => g.best)
    .filter((v): v is number => v !== null);
  return bests.length > 0 ? Math.min(...bests) : Infinity;
}
