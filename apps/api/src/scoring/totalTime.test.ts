import { describe, it, expect } from 'vitest';
import { scoreTotalTime } from './totalTime.js';
import type { ScoringInput, GameRanking } from './types.js';

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
    today: '2026-09-01', // posterior a todos los `days` usados en estos tests: siempre "días ya terminados"
    ...overrides,
  };
}

function byGame(rankings: GameRanking[], slug: string): GameRanking {
  return rankings.find((r) => r.gameSlug === slug)!;
}

describe('scoreTotalTime · D2 (2026-09-01): un ranking por juego, sin total combinado', () => {
  it('arma un ranking por cada juego activo, independiente uno del otro', () => {
    const { rankings } = scoreTotalTime(
      baseInput({
        entries: [
          { userId: 'sofi', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 300, dnf: false, verified: true },
          { userId: 'sofi', gameSlug: 'cruci-experto', puzzleDate: '2026-08-31', durationSeconds: 900, dnf: false, verified: true },
          { userId: 'nacho', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 400, dnf: false, verified: false },
          { userId: 'nacho', gameSlug: 'cruci-experto', puzzleDate: '2026-08-31', durationSeconds: 700, dnf: false, verified: false },
        ],
      }),
    );

    expect(rankings.map((r) => r.gameSlug)).toEqual(['crucigrama', 'cruci-experto']);

    // Crucigrama: Sofi (300) gana.
    const cruci = byGame(rankings, 'crucigrama');
    expect(cruci.rows.map((r) => r.userId)).toEqual(['sofi', 'nacho']);
    expect(cruci.rows[0]).toMatchObject({ rank: 1, totalSeconds: 300, bestSeconds: 300, daysPlayed: 1, dnfCount: 0, dailyWins: 1 });

    // Cruci Experto: Nacho (700) gana — el orden se invierte respecto de Crucigrama,
    // justo lo que el ranking combinado anterior no podía mostrar.
    const experto = byGame(rankings, 'cruci-experto');
    expect(experto.rows.map((r) => r.userId)).toEqual(['nacho', 'sofi']);
    expect(experto.rows[0]).toMatchObject({ rank: 1, totalSeconds: 700, dailyWins: 1 });
  });
});

describe('scoreTotalTime · un DNF', () => {
  it('suma la penalización vigente y cuenta en dnf_count, sólo en el juego del DNF', () => {
    const { rankings } = scoreTotalTime(
      baseInput({
        entries: [
          { userId: 'sofi', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 300, dnf: false, verified: true },
          { userId: 'sofi', gameSlug: 'cruci-experto', puzzleDate: '2026-08-31', durationSeconds: 0, dnf: true, verified: false },
        ],
        members: [{ userId: 'sofi', displayName: 'Sofi', avatar: null }],
      }),
    );
    expect(byGame(rankings, 'crucigrama').rows[0]).toMatchObject({ totalSeconds: 300, dnfCount: 0, bestSeconds: 300 });
    expect(byGame(rankings, 'cruci-experto').rows[0]).toMatchObject({ totalSeconds: 2400, dnfCount: 1, bestSeconds: null });
  });
});

describe('scoreTotalTime · ausencia', () => {
  const entriesSofiOnly = [
    { userId: 'sofi', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 300, dnf: false, verified: true },
    { userId: 'sofi', gameSlug: 'cruci-experto', puzzleDate: '2026-08-31', durationSeconds: 600, dnf: false, verified: true },
    // nacho no cargó nada ese día, en ningún juego
  ];

  it('con absence_policy "penalize" suma la penalización de cada juego, cada uno en su propia tabla', () => {
    const { rankings } = scoreTotalTime(baseInput({ entries: entriesSofiOnly, settings: { absencePolicy: 'penalize', dropWorstN: 0 } }));
    const nachoCruci = byGame(rankings, 'crucigrama').rows.find((r) => r.userId === 'nacho')!;
    const nachoExperto = byGame(rankings, 'cruci-experto').rows.find((r) => r.userId === 'nacho')!;
    expect(nachoCruci.totalSeconds).toBe(1200);
    expect(nachoExperto.totalSeconds).toBe(2400);
    expect(nachoCruci.daysPlayed).toBe(0); // no jugó, aunque le sumó penalización
  });

  it('con absence_policy "ignore" no le suma nada y no participa de ningún ranking', () => {
    const { rankings } = scoreTotalTime(baseInput({ entries: entriesSofiOnly, settings: { absencePolicy: 'ignore', dropWorstN: 0 } }));
    for (const gameSlug of ['crucigrama', 'cruci-experto']) {
      const nacho = byGame(rankings, gameSlug).rows.find((r) => r.userId === 'nacho')!;
      expect(nacho.totalSeconds).toBeNull();
      expect(nacho.rank).toBe(2); // aparece último, no desaparece de la tabla
      const sofi = byGame(rankings, gameSlug).rows.find((r) => r.userId === 'sofi')!;
      expect(sofi.rank).toBe(1);
    }
  });
});

describe('scoreTotalTime · empates dentro de un juego, un criterio a la vez (RF-15)', () => {
  it('desempata por victorias diarias', () => {
    const { rankings } = scoreTotalTime(
      baseInput({
        days: ['2026-08-30', '2026-08-31'],
        entries: [
          // Mismo total en crucigrama (450) los dos días sumados, pero Sofi ganó el 30.
          { userId: 'sofi', gameSlug: 'crucigrama', puzzleDate: '2026-08-30', durationSeconds: 200, dnf: false, verified: true },
          { userId: 'sofi', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 250, dnf: false, verified: true },
          { userId: 'nacho', gameSlug: 'crucigrama', puzzleDate: '2026-08-30', durationSeconds: 300, dnf: false, verified: true },
          { userId: 'nacho', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 150, dnf: false, verified: true },
        ],
      }),
    );
    const cruci = byGame(rankings, 'crucigrama');
    const sofi = cruci.rows.find((r) => r.userId === 'sofi')!;
    const nacho = cruci.rows.find((r) => r.userId === 'nacho')!;
    expect(sofi.totalSeconds).toBe(450);
    expect(nacho.totalSeconds).toBe(450);
    expect(sofi.dailyWins).toBe(1); // ganó el 30 (200 < 300)
    expect(nacho.dailyWins).toBe(1); // ganó el 31 (150 < 250)
    // Total y victorias empatados exactos → sigue al próximo criterio (mejor individual): Nacho (150 < 200).
    expect(cruci.rows.map((r) => r.userId)).toEqual(['nacho', 'sofi']);
  });

  it('con totales y DNF empatados, gana quien tuvo mejor tiempo individual', () => {
    const { rankings } = scoreTotalTime(
      baseInput({
        entries: [
          { userId: 'sofi', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 400, dnf: false, verified: true },
          { userId: 'nacho', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 400, dnf: false, verified: true },
        ],
      }),
    );
    const cruci = byGame(rankings, 'crucigrama');
    // Empate exacto en todo → desempata alfabético (Nacho antes que Sofi).
    expect(cruci.rows.map((r) => r.userId)).toEqual(['nacho', 'sofi']);
  });

  it('con total y victorias diarias empatados, gana quien tiene menos DNF', () => {
    const { rankings } = scoreTotalTime(
      baseInput({
        entries: [
          // Sofi: DNF en crucigrama (paga 1200, la penalización).
          { userId: 'sofi', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 0, dnf: true, verified: false },
          // Nacho: mismo total (1200) pero sin DNF.
          { userId: 'nacho', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 1200, dnf: false, verified: true },
        ],
      }),
    );
    const cruci = byGame(rankings, 'crucigrama');
    expect(cruci.rows[0]!.totalSeconds).toBe(1200);
    expect(cruci.rows[1]!.totalSeconds).toBe(1200);
    expect(cruci.rows.map((r) => r.userId)).toEqual(['nacho', 'sofi']); // Nacho: 0 DNF vs 1
  });

  it('si todo empata, desempata alfabético', () => {
    const { rankings } = scoreTotalTime(
      baseInput({
        entries: [
          { userId: 'sofi', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 500, dnf: false, verified: true },
          { userId: 'nacho', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 500, dnf: false, verified: true },
        ],
      }),
    );
    expect(byGame(rankings, 'crucigrama').rows.map((r) => r.userId)).toEqual(['nacho', 'sofi']);
  });
});

describe('scoreTotalTime · drop worst, ahora por juego (D2)', () => {
  it('descarta el peor tiempo de CADA juego por separado, no un día combinado', () => {
    const { rankings } = scoreTotalTime(
      baseInput({
        days: ['2026-08-30', '2026-08-31'],
        members: [{ userId: 'sofi', displayName: 'Sofi', avatar: null }],
        settings: { absencePolicy: 'penalize', dropWorstN: 1 },
        entries: [
          // Crucigrama: peor es el 30 (300) → se descarta, queda el 31 (250).
          { userId: 'sofi', gameSlug: 'crucigrama', puzzleDate: '2026-08-30', durationSeconds: 300, dnf: false, verified: true },
          { userId: 'sofi', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 250, dnf: false, verified: true },
          // Cruci Experto: el DNF del 30 es el peor (2400) → se descarta, queda el 31 (350).
          { userId: 'sofi', gameSlug: 'cruci-experto', puzzleDate: '2026-08-30', durationSeconds: 2400, dnf: true, verified: false },
          { userId: 'sofi', gameSlug: 'cruci-experto', puzzleDate: '2026-08-31', durationSeconds: 350, dnf: false, verified: true },
        ],
      }),
    );
    const cruci = byGame(rankings, 'crucigrama').rows[0]!;
    expect(cruci.totalSeconds).toBe(250);
    expect(cruci.daysPlayed).toBe(1);
    expect(cruci.droppedDays).toEqual(['2026-08-30']);

    const experto = byGame(rankings, 'cruci-experto').rows[0]!;
    expect(experto.totalSeconds).toBe(350);
    expect(experto.dnfCount).toBe(0); // el DNF vivía en el día descartado
    expect(experto.droppedDays).toEqual(['2026-08-30']);
  });
});

describe('scoreTotalTime · grupo con un solo jugador', () => {
  it('igual arma el ranking de cada juego, con rank 1 solo', () => {
    const { rankings } = scoreTotalTime(
      baseInput({
        members: [{ userId: 'sofi', displayName: 'Sofi', avatar: null }],
        entries: [
          { userId: 'sofi', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 300, dnf: false, verified: true },
          { userId: 'sofi', gameSlug: 'cruci-experto', puzzleDate: '2026-08-31', durationSeconds: 600, dnf: false, verified: true },
        ],
      }),
    );
    expect(byGame(rankings, 'crucigrama').rows).toHaveLength(1);
    expect(byGame(rankings, 'crucigrama').rows[0]).toMatchObject({ rank: 1, totalSeconds: 300, dailyWins: 1 });
    expect(byGame(rankings, 'cruci-experto').rows[0]).toMatchObject({ rank: 1, totalSeconds: 600, dailyWins: 1 });
  });
});

describe('scoreTotalTime · mes sin datos', () => {
  it('con absence_policy "ignore", nadie tiene un total real en ningún juego', () => {
    const { rankings } = scoreTotalTime(baseInput({ entries: [], settings: { absencePolicy: 'ignore', dropWorstN: 0 } }));
    for (const ranking of rankings) {
      for (const row of ranking.rows) {
        expect(row.totalSeconds).toBeNull();
        expect(row.rank).not.toBeNull(); // aparecen en la tabla igual, al fondo
      }
      // Sin datos, el orden entre "sin participar" es alfabético.
      expect(ranking.rows.map((r) => r.userId)).toEqual(['nacho', 'sofi']);
    }
  });

  it('con absence_policy "penalize" (default), un mes sin datos igual reparte penalización, por juego', () => {
    // No es un caso degenerado: bajo "penalize" la inactividad SIEMPRE cuenta
    // (RF-8) — no hay "mes sin datos" libre de consecuencia con esta regla.
    const { rankings } = scoreTotalTime(baseInput({ entries: [] }));
    expect(byGame(rankings, 'crucigrama').rows[0]!.totalSeconds).toBe(1200);
    expect(byGame(rankings, 'cruci-experto').rows[0]!.totalSeconds).toBe(2400);
  });
});

describe('scoreTotalTime · el día en curso no penaliza (RF-8)', () => {
  it('con un juego sin cargar HOY, no suma penalización en ESE juego — el día no terminó', () => {
    const { rankings } = scoreTotalTime(
      baseInput({
        days: ['2026-08-31', '2026-09-01'],
        today: '2026-09-01', // "hoy" es el último día del rango: todavía en curso
        members: [{ userId: 'sofi', displayName: 'Sofi', avatar: null }],
        entries: [
          // Sofi cargó ayer completo, y hoy sólo crucigrama (experto queda pendiente, no penalizado).
          { userId: 'sofi', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 300, dnf: false, verified: true },
          { userId: 'sofi', gameSlug: 'cruci-experto', puzzleDate: '2026-08-31', durationSeconds: 600, dnf: false, verified: true },
          { userId: 'sofi', gameSlug: 'crucigrama', puzzleDate: '2026-09-01', durationSeconds: 350, dnf: false, verified: true },
          // cruci-experto de hoy: no cargado — no debe penalizar.
        ],
      }),
    );
    expect(byGame(rankings, 'crucigrama').rows[0]!.totalSeconds).toBe(300 + 350);
    expect(byGame(rankings, 'crucigrama').rows[0]!.daysPlayed).toBe(2);
    expect(byGame(rankings, 'cruci-experto').rows[0]!.totalSeconds).toBe(600); // sin la penalización de hoy
  });

  it('un día pasado sin cargar sí penaliza en cada juego, aunque el día de hoy no', () => {
    const { rankings } = scoreTotalTime(
      baseInput({
        days: ['2026-08-31', '2026-09-01'],
        today: '2026-09-01',
        members: [{ userId: 'sofi', displayName: 'Sofi', avatar: null }],
        entries: [], // no cargó nada, ni ayer (terminado) ni hoy (en curso)
      }),
    );
    // Ayer: penaliza. Hoy: no penaliza todavía.
    expect(byGame(rankings, 'crucigrama').rows[0]!.totalSeconds).toBe(1200);
    expect(byGame(rankings, 'cruci-experto').rows[0]!.totalSeconds).toBe(2400);
  });
});
