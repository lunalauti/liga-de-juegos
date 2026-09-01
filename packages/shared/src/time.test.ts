import { describe, it, expect } from 'vitest';
import { parseTime, formatTime, formatDuration, TimeParseError } from './time.js';

describe('parseTime', () => {
  it('acepta mm:ss', () => {
    expect(parseTime('7:45')).toBe(465);
    expect(parseTime('07:45')).toBe(465);
    expect(parseTime('12:03')).toBe(723);
  });

  it('acepta hh:mm:ss', () => {
    expect(parseTime('1:07:45')).toBe(4065);
  });

  it('acepta sólo dígitos', () => {
    expect(parseTime('745')).toBe(465);
    expect(parseTime('45')).toBe(45);
    expect(parseTime('1745')).toBe(1065);
    expect(parseTime('10745')).toBe(4065);
  });

  it('ignora espacios alrededor', () => {
    expect(parseTime('  6:41 ')).toBe(401);
  });

  it('rechaza lo que no es un tiempo', () => {
    for (const bad of ['', '   ', 'abc', '7:60', '1:70:00', '7:', ':45', '-5', '7.45', '1234567']) {
      expect(() => parseTime(bad), bad).toThrow(TimeParseError);
    }
  });

  it('rechaza cero', () => {
    expect(() => parseTime('0:00')).toThrow(TimeParseError);
  });

  it('es reversible con formatTime', () => {
    for (const s of ['00:45', '06:41', '12:03', '45:00', '1:07:45']) {
      expect(formatTime(parseTime(s))).toBe(s);
    }
  });
});

describe('formatTime', () => {
  it('formatea con dos dígitos', () => {
    expect(formatTime(465)).toBe('07:45');
    expect(formatTime(45)).toBe('00:45');
    expect(formatTime(2700)).toBe('45:00');
    expect(formatTime(4065)).toBe('1:07:45');
  });
});

describe('formatDuration', () => {
  it('usa horas para los totales largos', () => {
    expect(formatDuration(170460)).toBe('47:21');
    expect(formatDuration(1800)).toBe('30 min');
  });
});
