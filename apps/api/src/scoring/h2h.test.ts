import { describe, it, expect } from 'vitest';
import { computeH2H } from './h2h.js';
import type { GameH2H, ScoringInput } from './types.js';

const GAMES = [
  { slug: 'crucigrama', name: 'Crucigrama', penaltySeconds: 1200 },
  { slug: 'cruci-experto', name: 'Cruci Experto', penaltySeconds: 2400 },
];

function baseInput(overrides: Partial<ScoringInput> = {}): ScoringInput {
  return {
    members: [
      { userId: 'sofi', displayName: 'Sofi', avatar: null },
      { userId: 'nacho', displayName: 'Nacho', avatar: null },
    ],
    games: GAMES,
    days: ['2026-08-31'],
    entries: [],
    blackouts: [],
    settings: { absencePolicy: 'penalize', dropWorstN: 0 },
    today: '2026-09-01',
    ...overrides,
  };
}

function byGame(games: GameH2H[], slug: string): GameH2H {
  return games.find((g) => g.gameSlug === slug)!;
}

describe('computeH2H · por juego, sin mezclar (D2)', () => {
  it('cuenta un día ganado como una victoria contra ese rival, en ESE juego', () => {
    const { games } = computeH2H(
      baseInput({
        entries: [
          { userId: 'sofi', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 300, dnf: false, verified: true },
          { userId: 'nacho', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 400, dnf: false, verified: true },
          // Cruci Experto: se invierte.
          { userId: 'sofi', gameSlug: 'cruci-experto', puzzleDate: '2026-08-31', durationSeconds: 900, dnf: false, verified: true },
          { userId: 'nacho', gameSlug: 'cruci-experto', puzzleDate: '2026-08-31', durationSeconds: 700, dnf: false, verified: true },
        ],
      }),
    );

    const cruci = byGame(games, 'crucigrama');
    const sofiCruci = cruci.rows.find((r) => r.userId === 'sofi')!;
    expect(sofiCruci.vs).toEqual([{ opponentUserId: 'nacho', wins: 1, losses: 0 }]);

    const experto = byGame(games, 'cruci-experto');
    const sofiExperto = experto.rows.find((r) => r.userId === 'sofi')!;
    expect(sofiExperto.vs).toEqual([{ opponentUserId: 'nacho', wins: 0, losses: 1 }]);
  });

  it('acumula varios días', () => {
    const { games } = computeH2H(
      baseInput({
        days: ['2026-08-30', '2026-08-31'],
        entries: [
          { userId: 'sofi', gameSlug: 'crucigrama', puzzleDate: '2026-08-30', durationSeconds: 200, dnf: false, verified: true },
          { userId: 'nacho', gameSlug: 'crucigrama', puzzleDate: '2026-08-30', durationSeconds: 300, dnf: false, verified: true },
          { userId: 'sofi', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 300, dnf: false, verified: true },
          { userId: 'nacho', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 250, dnf: false, verified: true },
        ],
      }),
    );
    const cruci = byGame(games, 'crucigrama');
    const sofi = cruci.rows.find((r) => r.userId === 'sofi')!;
    expect(sofi.vs).toEqual([{ opponentUserId: 'nacho', wins: 1, losses: 1 }]);
  });
});

describe('computeH2H · empate exacto no le suma a nadie', () => {
  it('mismo tiempo → 0 victorias para los dos', () => {
    const { games } = computeH2H(
      baseInput({
        entries: [
          { userId: 'sofi', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 500, dnf: false, verified: true },
          { userId: 'nacho', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 500, dnf: false, verified: true },
        ],
      }),
    );
    const cruci = byGame(games, 'crucigrama');
    expect(cruci.rows.find((r) => r.userId === 'sofi')!.vs).toEqual([{ opponentUserId: 'nacho', wins: 0, losses: 0 }]);
  });
});

describe('computeH2H · sin día compartido, no hay fila de ese rival', () => {
  it('si nunca coincidieron un día, "vs" no incluye a ese rival', () => {
    const { games } = computeH2H(
      baseInput({
        days: ['2026-08-30', '2026-08-31'],
        entries: [
          { userId: 'sofi', gameSlug: 'crucigrama', puzzleDate: '2026-08-30', durationSeconds: 300, dnf: false, verified: true },
          // Nacho sólo jugó cruci-experto, nunca crucigrama.
          { userId: 'nacho', gameSlug: 'cruci-experto', puzzleDate: '2026-08-31', durationSeconds: 800, dnf: false, verified: true },
        ],
        settings: { absencePolicy: 'ignore', dropWorstN: 0 }, // sin "ignore" la ausencia igual generaría una celda
      }),
    );
    const cruci = byGame(games, 'crucigrama');
    const sofi = cruci.rows.find((r) => r.userId === 'sofi')!;
    expect(sofi.vs).toEqual([]);
    // Nacho ni siquiera tiene fila en Crucigrama — nunca jugó ese juego.
    expect(cruci.rows.some((r) => r.userId === 'nacho')).toBe(false);
  });
});

describe('computeH2H · DNF y ausencia penalizada cuentan como "perdió ese día"', () => {
  it('un DNF paga la penalización y compite igual en el H2H', () => {
    const { games } = computeH2H(
      baseInput({
        entries: [
          { userId: 'sofi', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 300, dnf: false, verified: true },
          { userId: 'nacho', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 0, dnf: true, verified: false },
        ],
      }),
    );
    const cruci = byGame(games, 'crucigrama');
    expect(cruci.rows.find((r) => r.userId === 'sofi')!.vs).toEqual([{ opponentUserId: 'nacho', wins: 1, losses: 0 }]);
  });
});
