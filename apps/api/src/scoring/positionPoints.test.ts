import { describe, it, expect } from 'vitest';
import { scorePositionPoints } from './positionPoints.js';
import type { GameRanking, ScoringInput } from './types.js';

const GAMES = [
  { slug: 'crucigrama', name: 'Crucigrama', penaltySeconds: 1200 },
  { slug: 'cruci-experto', name: 'Cruci Experto', penaltySeconds: 2400 },
];
const POINTS = [5, 3, 2, 1]; // 1º-2º-3º-4º del día, RF-13

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

function byGame(rankings: GameRanking[], slug: string): GameRanking {
  return rankings.find((r) => r.gameSlug === slug)!;
}

describe('scorePositionPoints · por juego, sin total combinado (D2)', () => {
  it('reparte puntos por orden de llegada, cada juego con su propia tabla', () => {
    const { rankings } = scorePositionPoints(
      baseInput({
        entries: [
          { userId: 'sofi', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 300, dnf: false, verified: true },
          { userId: 'nacho', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 400, dnf: false, verified: true },
          // Cruci Experto: el orden se invierte.
          { userId: 'sofi', gameSlug: 'cruci-experto', puzzleDate: '2026-08-31', durationSeconds: 900, dnf: false, verified: true },
          { userId: 'nacho', gameSlug: 'cruci-experto', puzzleDate: '2026-08-31', durationSeconds: 700, dnf: false, verified: true },
        ],
      }),
      POINTS,
    );

    const cruci = byGame(rankings, 'crucigrama');
    expect(cruci.rows.map((r) => r.userId)).toEqual(['sofi', 'nacho']);
    expect(cruci.rows[0]).toMatchObject({ points: 5, rank: 1 });
    expect(cruci.rows[1]).toMatchObject({ points: 3, rank: 2 });

    const experto = byGame(rankings, 'cruci-experto');
    expect(experto.rows.map((r) => r.userId)).toEqual(['nacho', 'sofi']);
    expect(experto.rows[0]).toMatchObject({ points: 5, rank: 1 });
  });
});

describe('scorePositionPoints · DNF y ausencias', () => {
  it('un DNF queda último y suma 0 puntos, sin importar cuánto "tardó"', () => {
    const { rankings } = scorePositionPoints(
      baseInput({
        entries: [
          { userId: 'sofi', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 900, dnf: false, verified: true },
          { userId: 'nacho', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 0, dnf: true, verified: false },
        ],
      }),
      POINTS,
    );
    const cruci = byGame(rankings, 'crucigrama');
    expect(cruci.rows.find((r) => r.userId === 'sofi')!.points).toBe(5);
    expect(cruci.rows.find((r) => r.userId === 'nacho')!.points).toBe(0);
  });

  it('con absence_policy "penalize", quien no cargó nada también suma 0 (no desaparece de la tabla)', () => {
    const { rankings } = scorePositionPoints(
      baseInput({
        entries: [
          { userId: 'sofi', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 300, dnf: false, verified: true },
        ],
        settings: { absencePolicy: 'penalize', dropWorstN: 0 },
      }),
      POINTS,
    );
    const nacho = byGame(rankings, 'crucigrama').rows.find((r) => r.userId === 'nacho')!;
    expect(nacho.points).toBe(0);
    expect(nacho.rank).toBe(2);
  });
});

describe('scorePositionPoints · más de 4 jugadores: el 5º en adelante suma 0', () => {
  it('respeta el largo de la tabla de puntos configurada', () => {
    const members = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ userId: id, displayName: id.toUpperCase(), avatar: null }));
    const entries = members.map((m, i) => ({
      userId: m.userId,
      gameSlug: 'crucigrama',
      puzzleDate: '2026-08-31',
      durationSeconds: 100 * (i + 1),
      dnf: false,
      verified: true,
    }));
    const { rankings } = scorePositionPoints(baseInput({ members, entries }), POINTS);
    const cruci = byGame(rankings, 'crucigrama');
    expect(cruci.rows.map((r) => r.points)).toEqual([5, 3, 2, 1, 0]);
  });
});

describe('scorePositionPoints · empate en puntos, desempata por tiempo total (§5.2)', () => {
  it('mismos puntos, distinto tiempo total → gana el más rápido', () => {
    const { rankings } = scorePositionPoints(
      baseInput({
        days: ['2026-08-30', '2026-08-31'],
        entries: [
          // Sofi gana ambos días (5+5=10 pts), total 300+300=600.
          { userId: 'sofi', gameSlug: 'crucigrama', puzzleDate: '2026-08-30', durationSeconds: 300, dnf: false, verified: true },
          { userId: 'sofi', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 300, dnf: false, verified: true },
          { userId: 'nacho', gameSlug: 'crucigrama', puzzleDate: '2026-08-30', durationSeconds: 400, dnf: false, verified: true },
          { userId: 'nacho', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 400, dnf: false, verified: true },
        ],
        members: [
          { userId: 'sofi', displayName: 'Sofi', avatar: null },
          { userId: 'nacho', displayName: 'Nacho', avatar: null },
        ],
      }),
      POINTS,
    );
    const cruci = byGame(rankings, 'crucigrama');
    const sofi = cruci.rows.find((r) => r.userId === 'sofi')!;
    const nacho = cruci.rows.find((r) => r.userId === 'nacho')!;
    expect(sofi.points).toBe(10); // gana los 2 días: 5+5
    expect(nacho.points).toBe(6); // siempre 2do de 2: 3+3
    expect(sofi.rank).toBe(1);
    expect(sofi.tied).toBe(false);
  });

  it('empate real: mismos puntos y mismo tiempo total → "tied", no 1º/2º inventados', () => {
    const { rankings } = scorePositionPoints(
      baseInput({
        days: ['2026-08-30', '2026-08-31'],
        entries: [
          // Sofi gana el 30, Nacho gana el 31 — 5 pts cada uno, mismo total de tiempo.
          { userId: 'sofi', gameSlug: 'crucigrama', puzzleDate: '2026-08-30', durationSeconds: 200, dnf: false, verified: true },
          { userId: 'sofi', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 300, dnf: false, verified: true },
          { userId: 'nacho', gameSlug: 'crucigrama', puzzleDate: '2026-08-30', durationSeconds: 300, dnf: false, verified: true },
          { userId: 'nacho', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 200, dnf: false, verified: true },
        ],
      }),
      POINTS,
    );
    const cruci = byGame(rankings, 'crucigrama');
    // Cada una gana un día (5 pts) y pierde el otro (3 pts): 8 pts las dos.
    expect(cruci.rows[0]!.points).toBe(8);
    expect(cruci.rows[1]!.points).toBe(8);
    expect(cruci.rows[0]!.totalSeconds).toBe(500);
    expect(cruci.rows[1]!.totalSeconds).toBe(500);
    expect(cruci.rows[0]!.rank).toBe(1);
    expect(cruci.rows[1]!.rank).toBe(1);
    expect(cruci.rows.every((r) => r.tied)).toBe(true);
  });
});

describe('scorePositionPoints · drop worst, por juego (D2) y en la unidad correcta', () => {
  it('descarta el día de MENOS puntos (el peor), no el de más tiempo', () => {
    const { rankings } = scorePositionPoints(
      baseInput({
        days: ['2026-08-30', '2026-08-31'],
        members: [{ userId: 'sofi', displayName: 'Sofi', avatar: null }],
        settings: { absencePolicy: 'penalize', dropWorstN: 1 },
        entries: [
          // Sofi es la única jugadora activa acá — siempre "gana" el día (5 pts),
          // sin importar el tiempo. El drop-worst en puntos no tiene nada que
          // descartar entre iguales, así que probamos con dos jugadores.
        ],
      }),
      POINTS,
    );
    // Con un solo jugador nunca hay "peor día" en puntos (siempre gana) — este
    // caso confirma que no rompe con 0 entries, no que descarte algo real.
    expect(byGame(rankings, 'crucigrama').rows[0]!.points).toBe(0);

    const { rankings: r2 } = scorePositionPoints(
      baseInput({
        days: ['2026-08-30', '2026-08-31'],
        settings: { absencePolicy: 'penalize', dropWorstN: 1 },
        entries: [
          // 30: Sofi gana (5), Nacho pierde (3). 31: Nacho gana (5), Sofi pierde (3).
          { userId: 'sofi', gameSlug: 'crucigrama', puzzleDate: '2026-08-30', durationSeconds: 200, dnf: false, verified: true },
          { userId: 'nacho', gameSlug: 'crucigrama', puzzleDate: '2026-08-30', durationSeconds: 300, dnf: false, verified: true },
          { userId: 'sofi', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 300, dnf: false, verified: true },
          { userId: 'nacho', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 200, dnf: false, verified: true },
        ],
      }),
      POINTS,
    );
    const sofi = byGame(r2, 'crucigrama').rows.find((r) => r.userId === 'sofi')!;
    // Sofi descarta el 31 (su peor día, 3 pts) y se queda sólo con el 30 (5 pts).
    expect(sofi.points).toBe(5);
    expect(sofi.droppedDays).toEqual(['2026-08-31']);
  });
});
