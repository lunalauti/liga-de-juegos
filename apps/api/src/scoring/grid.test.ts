import { describe, it, expect } from 'vitest';
import { buildGrid } from './grid.js';

const GAMES = [
  { slug: 'crucigrama', name: 'Crucigrama', penaltySeconds: 1200 },
  { slug: 'sudoku-avanzado', name: 'Sudoku Avanzado', penaltySeconds: 2700 },
];
const MEMBERS = [{ userId: 'u1', displayName: 'Uno', avatar: null }];
const DAYS = ['2026-08-31', '2026-09-01'];
const TODAY = '2026-09-02'; // posterior a todos los DAYS: en estos tests, todos son "días que ya terminaron"

describe('buildGrid', () => {
  it('usa el tiempo real cuando hay un entry sin DNF', () => {
    const grid = buildGrid({
      members: MEMBERS,
      games: GAMES,
      days: DAYS,
      entries: [{ userId: 'u1', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 400, dnf: false, verified: true }],
      blackouts: [],
      absencePolicy: 'penalize',
      today: TODAY,
    });
    const cell = grid.find((c) => c.gameSlug === 'crucigrama' && c.puzzleDate === '2026-08-31')!;
    expect(cell).toMatchObject({ seconds: 400, dnf: false, source: 'entry', verified: true });
  });

  it('un DNF cargado usa la penalización VIGENTE del grupo, no la guardada', () => {
    const grid = buildGrid({
      members: MEMBERS,
      games: GAMES,
      days: DAYS,
      // durationSeconds guardado en el entry es viejo (RF-17: el motor recalcula).
      entries: [{ userId: 'u1', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 999, dnf: true, verified: false }],
      blackouts: [],
      absencePolicy: 'penalize',
      today: TODAY,
    });
    const cell = grid.find((c) => c.gameSlug === 'crucigrama' && c.puzzleDate === '2026-08-31')!;
    expect(cell.seconds).toBe(1200); // penalización vigente de crucigrama, no 999
    expect(cell.source).toBe('entry');
  });

  it('ausencia con absence_policy "penalize" genera una celda con la penalización, si el día ya terminó', () => {
    const grid = buildGrid({ members: MEMBERS, games: GAMES, days: DAYS, entries: [], blackouts: [], absencePolicy: 'penalize', today: TODAY });
    expect(grid).toHaveLength(MEMBERS.length * GAMES.length * DAYS.length);
    expect(grid.every((c) => c.source === 'absence' && c.dnf)).toBe(true);
  });

  it('ausencia con absence_policy "ignore" no genera ninguna celda', () => {
    const grid = buildGrid({ members: MEMBERS, games: GAMES, days: DAYS, entries: [], blackouts: [], absencePolicy: 'ignore', today: TODAY });
    expect(grid).toHaveLength(0);
  });

  it('el día en curso NO se penaliza aunque falte cargar, sin importar absence_policy', () => {
    // Pedido explícito del usuario: sólo se penaliza un día que ya terminó.
    const grid = buildGrid({
      members: MEMBERS,
      games: GAMES,
      days: ['2026-08-31', '2026-09-01'],
      entries: [],
      blackouts: [],
      absencePolicy: 'penalize',
      today: '2026-09-01', // el 09-01 es "hoy": todavía no terminó
    });
    expect(grid.every((c) => c.puzzleDate !== '2026-09-01')).toBe(true); // nada de hoy
    expect(grid).toHaveLength(GAMES.length); // sólo el 08-31 (día ya terminado) generó celdas
  });

  it('un día anulado (blackout de todos los juegos) no genera celdas ese día', () => {
    const grid = buildGrid({
      members: MEMBERS,
      games: GAMES,
      days: DAYS,
      entries: [],
      blackouts: [{ puzzleDate: '2026-08-31', gameSlug: null }],
      absencePolicy: 'penalize',
      today: TODAY,
    });
    expect(grid.every((c) => c.puzzleDate !== '2026-08-31')).toBe(true);
    expect(grid).toHaveLength(GAMES.length); // sólo el 09-01 queda
  });

  it('un blackout de un solo juego no anula el resto del día', () => {
    const grid = buildGrid({
      members: MEMBERS,
      games: GAMES,
      days: ['2026-08-31'],
      entries: [],
      blackouts: [{ puzzleDate: '2026-08-31', gameSlug: 'crucigrama' }],
      absencePolicy: 'penalize',
      today: TODAY,
    });
    expect(grid).toHaveLength(1);
    expect(grid[0]!.gameSlug).toBe('sudoku-avanzado');
  });
});
