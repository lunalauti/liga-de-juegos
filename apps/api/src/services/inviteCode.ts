/**
 * Código de invitación legible al dictado (RF-3): CRUCI-84, no 6 caracteres al azar
 * — se dicta por teléfono mucho mejor. Ver specs/02-design.md §6.5.
 */

const STOPWORDS = new Set([
  'el', 'la', 'los', 'las', 'de', 'del', 'un', 'una', 'unos', 'unas',
  'y', 'en', 'para', 'con', 'grupo', 'liga', 'equipo', 'los del',
]);

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** La palabra más significativa del nombre del grupo, en mayúsculas, sin acentos. */
export function slugWord(name: string): string {
  const words = stripAccents(name)
    .toUpperCase()
    .replace(/[^A-Z\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w.toLowerCase()));

  const longest = [...words].sort((a, b) => b.length - a.length)[0] ?? 'GRUPO';
  return longest.slice(0, 5);
}

function twoDigits(): string {
  return String(Math.floor(10 + Math.random() * 90));
}

function threeDigits(): string {
  return String(Math.floor(100 + Math.random() * 900));
}

/**
 * Genera un código único reintentando ante colisión (RF-3). `isTaken` consulta la
 * base; se inyecta para poder testear el reintento sin una base real.
 */
export async function generateInviteCode(
  name: string,
  isTaken: (code: string) => Promise<boolean>,
): Promise<string> {
  const base = slugWord(name);

  for (let attempt = 0; attempt < 25; attempt++) {
    const code = `${base}-${twoDigits()}`;
    if (!(await isTaken(code))) return code;
  }
  // Espacio de 2 dígitos agotado (grupo muy popular con ese nombre): probamos con 3.
  for (let attempt = 0; attempt < 25; attempt++) {
    const code = `${base}-${threeDigits()}`;
    if (!(await isTaken(code))) return code;
  }
  throw new Error('No pudimos generar un código de invitación único. Probá con otro nombre de grupo.');
}
