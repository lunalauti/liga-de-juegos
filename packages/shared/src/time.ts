/**
 * Parseo y formato de tiempos. Una sola implementación, usada por el front y por la API,
 * para que "7:45" signifique lo mismo en los dos lados. Ver specs/02-design.md §6.6.
 */

export class TimeParseError extends Error {}

const MAX_SECONDS = 24 * 3600;

/**
 * Acepta las formas que alguien tipea de apuro:
 *   "7:45" | "07:45" -> 465     (mm:ss)
 *   "745"            -> 465     (los últimos dos dígitos son segundos)
 *   "45"             -> 45
 *   "1:07:45"        -> 4065    (hh:mm:ss)
 *   "10745"          -> 4065    (hhmmss)
 */
export function parseTime(input: string): number {
  const raw = input.trim();
  if (raw === '') throw new TimeParseError('Escribí un tiempo');

  if (raw.includes(':')) return fromParts(raw.split(':'), raw);

  if (!/^\d+$/.test(raw)) throw new TimeParseError(`No entiendo "${input}" como tiempo`);
  if (raw.length <= 2) return check(Number(raw), raw);
  if (raw.length <= 4) return fromParts([raw.slice(0, -2), raw.slice(-2)], raw);
  if (raw.length <= 6) return fromParts([raw.slice(0, -4), raw.slice(-4, -2), raw.slice(-2)], raw);
  throw new TimeParseError(`"${input}" tiene demasiados dígitos`);
}

function fromParts(parts: string[], raw: string): number {
  if (parts.length < 2 || parts.length > 3) throw new TimeParseError(`No entiendo "${raw}" como tiempo`);
  const nums = parts.map((p) => {
    if (!/^\d{1,2}$/.test(p.trim())) throw new TimeParseError(`No entiendo "${raw}" como tiempo`);
    return Number(p);
  }) as number[];

  const seconds = nums[nums.length - 1]!;
  const minutes = nums[nums.length - 2]!;
  const hours = nums.length === 3 ? nums[0]! : 0;

  if (seconds > 59) throw new TimeParseError('Los segundos van de 00 a 59');
  if (nums.length === 3 && minutes > 59) throw new TimeParseError('Los minutos van de 00 a 59');

  return check(hours * 3600 + minutes * 60 + seconds, raw);
}

function check(total: number, raw: string): number {
  if (total <= 0) throw new TimeParseError('El tiempo tiene que ser mayor a cero');
  if (total > MAX_SECONDS) throw new TimeParseError(`"${raw}" es demasiado`);
  return total;
}

/** 465 -> "07:45"; 4065 -> "1:07:45". Siempre con dos dígitos en minutos y segundos. */
export function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) throw new TimeParseError('Tiempo inválido');
  const s = Math.round(totalSeconds);
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Para los totales del mes, donde las horas importan: 47:21 hs se lee mejor que 2841 min. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}` : `${minutes} min`;
}
