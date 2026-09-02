import { addDays, todayInArgentina } from '@liga/shared';
import { db } from '../db.js';
import type { ScoringInput } from '../scoring/types.js';

/**
 * Carga compartida entre `routes/leaderboard.ts` y `routes/h2h.ts` — ambos arman
 * el mismo `ScoringInput` (roster, entries, blackouts, días del período) y sólo
 * difieren en qué motor corren sobre esa grilla.
 */
export interface Roster {
  members: { userId: string; displayName: string; avatar: string | null }[];
  games: { slug: string; name: string; penaltySeconds: number }[];
}

export async function loadRoster(groupId: string): Promise<Roster> {
  const [membersRes, gamesRes] = await Promise.all([
    db.query(
      `select p.id, p.display_name, p.avatar
         from public.group_members gm join public.profiles p on p.id = gm.user_id
        where gm.group_id = $1`,
      [groupId],
    ),
    db.query(
      `select g.slug, g.name, gg.penalty_seconds
         from public.group_games gg join public.games g on g.id = gg.game_id
        where gg.group_id = $1 and gg.enabled = true
        order by g.sort_order`,
      [groupId],
    ),
  ]);
  return {
    members: membersRes.rows.map((m) => ({ userId: m.id, displayName: m.display_name, avatar: m.avatar })),
    games: gamesRes.rows.map((g) => ({ slug: g.slug, name: g.name, penaltySeconds: g.penalty_seconds })),
  };
}

export async function loadEntries(groupId: string, from: string, to: string) {
  const r = await db.query(
    `select user_id, game_id, puzzle_date, duration_seconds, dnf, verified
       from public.entries
      where group_id = $1 and puzzle_date between $2 and $3`,
    [groupId, from, to],
  );
  return r.rows;
}

export async function loadBlackouts(groupId: string, from: string, to: string) {
  const r = await db.query(
    `select bd.puzzle_date, g.slug as game_slug
       from public.blackout_dates bd
       left join public.games g on g.id = bd.game_id
      where bd.group_id = $1 and bd.puzzle_date between $2 and $3`,
    [groupId, from, to],
  );
  return r.rows.map((b) => ({ puzzleDate: b.puzzle_date as string, gameSlug: (b.game_slug as string) ?? null }));
}

export function buildDays(start: string, end: string): string[] {
  const days: string[] = [];
  let cur = start;
  while (cur <= end) {
    days.push(cur);
    cur = addDays(cur, 1);
  }
  return days;
}

/** Arma el `ScoringInput` completo para un rango [start, until] — sin correr ningún motor todavía. */
export async function loadScoringInput(
  groupId: string,
  roster: Roster,
  gameIdBySlug: Map<string, string>,
  start: string,
  until: string,
): Promise<ScoringInput | null> {
  const days = buildDays(start, until);
  if (days.length === 0) return null;

  const [entriesRaw, blackouts] = await Promise.all([loadEntries(groupId, start, until), loadBlackouts(groupId, start, until)]);
  const gameSlugById = new Map([...gameIdBySlug].map(([slug, id]) => [id, slug]));
  const entries = entriesRaw
    .map((e) => ({
      userId: e.user_id as string,
      gameSlug: gameSlugById.get(e.game_id as string),
      puzzleDate: e.puzzle_date as string,
      durationSeconds: e.duration_seconds as number,
      dnf: e.dnf as boolean,
      verified: e.verified as boolean,
    }))
    .filter((e): e is ScoringInput['entries'][number] => e.gameSlug !== undefined); // juego desactivado en el grupo: no cuenta

  const settingsRes = await db.query(`select settings from public.groups where id = $1`, [groupId]);
  const settings = settingsRes.rows[0]?.settings ?? {};

  return {
    members: roster.members,
    games: roster.games,
    days,
    entries,
    blackouts,
    settings: { absencePolicy: settings.absence_policy ?? 'penalize', dropWorstN: settings.drop_worst_n ?? 0 },
    today: todayInArgentina(),
  };
}

export async function loadGameIdBySlug(): Promise<Map<string, string>> {
  const gamesRes = await db.query(`select id, slug from public.games`);
  return new Map(gamesRes.rows.map((g) => [g.slug as string, g.id as string]));
}
