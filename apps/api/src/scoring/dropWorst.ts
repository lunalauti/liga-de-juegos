/**
 * RF-13 — descarta los N días de mayor suma diaria, por jugador. Se descarta el
 * DÍA entero (todos los juegos de esa fecha), no un juego suelto: "un mes pésimo
 * no cuesta el mes" es la idea, no "esconder el peor juego".
 */
export function pickDroppedDays(dailyTotals: { puzzleDate: string; seconds: number }[], n: number): Set<string> {
  if (n <= 0) return new Set();
  return new Set(
    [...dailyTotals]
      .sort((a, b) => b.seconds - a.seconds)
      .slice(0, n)
      .map((d) => d.puzzleDate),
  );
}
