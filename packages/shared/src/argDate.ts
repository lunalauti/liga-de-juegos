/**
 * Fechas en zona horaria Argentina (RNF-3). Argentina es UTC-3 fijo todo el año
 * —no tiene horario de verano—, así que no hace falta una librería de zonas
 * horarias: alcanza con un offset constante. Todo lo que sale de acá es un
 * `date` puro (`YYYY-MM-DD`), nunca un instante.
 */

const ART_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC-3

/** "Hoy" en Argentina, como YYYY-MM-DD. El servidor nunca confía en la fecha del cliente. */
export function todayInArgentina(now: Date = new Date()): string {
  return new Date(now.getTime() - ART_OFFSET_MS).toISOString().slice(0, 10);
}

function toUtcMidnight(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

/** Días de diferencia entre dos fechas puras (b − a). Positivo si b es posterior. */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtcMidnight(b) - toUtcMidnight(a)) / 86_400_000);
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function isFutureDate(dateStr: string, now: Date = new Date()): boolean {
  return dateStr > todayInArgentina(now);
}

/** RF-10: no se puede cargar retroactivamente más de 7 días. */
export function isWithinRetroactiveWindow(dateStr: string, now: Date = new Date(), maxDays = 7): boolean {
  const today = todayInArgentina(now);
  const diff = daysBetween(dateStr, today); // días transcurridos desde puzzleDate hasta hoy
  return diff >= 0 && diff <= maxDays;
}

/**
 * RF-9: un resultado se puede editar/borrar hasta `editWindowHours` después de que
 * "cierra" su día. El día cierra a la medianoche ART siguiente al `puzzleDate` —
 * regla explícita porque el RF no lo precisaba.
 */
export function isEntryEditable(puzzleDate: string, editWindowHours: number, now: Date = new Date()): boolean {
  const closesAtUtc = toUtcMidnight(addDays(puzzleDate, 1)) + ART_OFFSET_MS; // 00:00 ART = 03:00 UTC
  const deadline = closesAtUtc + editWindowHours * 3_600_000;
  return now.getTime() < deadline;
}

/** RF-11: la semana va de lunes a domingo. */
export function weekBounds(dateStr: string): { start: string; end: string } {
  const dow = new Date(toUtcMidnight(dateStr)).getUTCDay(); // 0 = domingo … 6 = sábado
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const start = addDays(dateStr, mondayOffset);
  return { start, end: addDays(start, 6) };
}

/** RF-11: el mes va del 1 al último día del mes calendario. */
export function monthBounds(dateStr: string): { start: string; end: string } {
  const [y, m] = dateStr.split('-').map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(lastDay)}` };
}
