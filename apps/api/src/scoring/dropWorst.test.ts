import { describe, it, expect } from 'vitest';
import { pickDroppedDays } from './dropWorst.js';

describe('pickDroppedDays', () => {
  it('no descarta nada si n = 0', () => {
    expect(pickDroppedDays([{ puzzleDate: '2026-08-01', seconds: 9999 }], 0)).toEqual(new Set());
  });

  it('descarta los N días de mayor suma', () => {
    const totals = [
      { puzzleDate: '2026-08-01', seconds: 100 },
      { puzzleDate: '2026-08-02', seconds: 500 },
      { puzzleDate: '2026-08-03', seconds: 300 },
      { puzzleDate: '2026-08-04', seconds: 900 },
    ];
    expect(pickDroppedDays(totals, 2)).toEqual(new Set(['2026-08-04', '2026-08-02']));
  });

  it('si n supera la cantidad de días, descarta todos', () => {
    const totals = [
      { puzzleDate: '2026-08-01', seconds: 100 },
      { puzzleDate: '2026-08-02', seconds: 200 },
    ];
    expect(pickDroppedDays(totals, 5)).toEqual(new Set(['2026-08-01', '2026-08-02']));
  });
});
