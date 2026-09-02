/**
 * RF-13 — descarta los N valores más altos de la lista, por jugador. Desde D2
 * (2026-09-01) se llama con los valores de UN SOLO juego (un mes pésimo en Sudoku
 * no cuesta el mes en Crucigrama) — antes se llamaba con la suma de los 3 juegos
 * por día. La función en sí no sabe ni le importa qué representa cada `seconds`;
 * sólo descarta los N más altos.
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
