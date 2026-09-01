import { describe, it, expect } from 'vitest';
import {
  todayInArgentina, daysBetween, addDays, isFutureDate,
  isWithinRetroactiveWindow, isEntryEditable, weekBounds, monthBounds,
} from './argDate.js';

describe('todayInArgentina', () => {
  it('resta el offset de Argentina, no usa el reloj del cliente', () => {
    // 01:30 UTC del 1/9 es todavía 31/8 en Argentina (UTC-3)
    expect(todayInArgentina(new Date('2026-09-01T01:30:00Z'))).toBe('2026-08-31');
    // 03:30 UTC del 1/9 ya es 1/9 en Argentina
    expect(todayInArgentina(new Date('2026-09-01T03:30:00Z'))).toBe('2026-09-01');
  });
});

describe('daysBetween / addDays', () => {
  it('cuenta días calendario, sin efectos de zona horaria', () => {
    expect(daysBetween('2026-08-25', '2026-08-31')).toBe(6);
    expect(daysBetween('2026-08-31', '2026-08-25')).toBe(-6);
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-09-01', -1)).toBe('2026-08-31');
  });
});

describe('isFutureDate', () => {
  it('rechaza fechas posteriores a hoy en Argentina', () => {
    const now = new Date('2026-08-31T14:00:00Z'); // 11:00 ART
    expect(isFutureDate('2026-09-01', now)).toBe(true);
    expect(isFutureDate('2026-08-31', now)).toBe(false);
    expect(isFutureDate('2026-08-30', now)).toBe(false);
  });
});

describe('isWithinRetroactiveWindow (RF-10)', () => {
  const now = new Date('2026-08-31T14:00:00Z'); // hoy = 2026-08-31 ART

  it('acepta hoy y hasta 7 días atrás', () => {
    expect(isWithinRetroactiveWindow('2026-08-31', now)).toBe(true);
    expect(isWithinRetroactiveWindow('2026-08-24', now)).toBe(true); // exactamente 7 días
  });

  it('rechaza más de 7 días atrás', () => {
    expect(isWithinRetroactiveWindow('2026-08-23', now)).toBe(false);
  });

  it('rechaza fechas futuras', () => {
    expect(isWithinRetroactiveWindow('2026-09-01', now)).toBe(false);
  });
});

describe('isEntryEditable (RF-9)', () => {
  it('es editable dentro de las 48 h posteriores al cierre del día', () => {
    // puzzleDate 31/8; cierra 1/9 00:00 ART = 03:00 UTC 1/9; +48h = 03:00 UTC 3/9
    expect(isEntryEditable('2026-08-31', 48, new Date('2026-09-03T02:59:00Z'))).toBe(true);
    expect(isEntryEditable('2026-08-31', 48, new Date('2026-09-03T03:01:00Z'))).toBe(false);
  });

  it('respeta una ventana de edición distinta si el grupo la configuró', () => {
    // Ventana de 1h: cierra 03:00 UTC 1/9, deadline 04:00 UTC 1/9.
    expect(isEntryEditable('2026-08-31', 1, new Date('2026-09-01T03:30:00Z'))).toBe(true);
    expect(isEntryEditable('2026-08-31', 1, new Date('2026-09-01T04:30:00Z'))).toBe(false);
    expect(isEntryEditable('2026-08-31', 24, new Date('2026-09-01T03:30:00Z'))).toBe(true);
  });
});

describe('weekBounds (lunes a domingo)', () => {
  it('resuelve la semana de un lunes', () => {
    expect(weekBounds('2026-08-31')).toEqual({ start: '2026-08-31', end: '2026-09-06' });
  });
  it('resuelve la semana de un domingo', () => {
    expect(weekBounds('2026-09-06')).toEqual({ start: '2026-08-31', end: '2026-09-06' });
  });
  it('resuelve un día en el medio de la semana', () => {
    expect(weekBounds('2026-09-02')).toEqual({ start: '2026-08-31', end: '2026-09-06' });
  });
});

describe('monthBounds', () => {
  it('resuelve un mes de 31 días', () => {
    expect(monthBounds('2026-08-15')).toEqual({ start: '2026-08-01', end: '2026-08-31' });
  });
  it('resuelve febrero (no bisiesto)', () => {
    expect(monthBounds('2026-02-10')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });
  it('resuelve febrero bisiesto', () => {
    expect(monthBounds('2028-02-10')).toEqual({ start: '2028-02-01', end: '2028-02-29' });
  });
});
