/** Iniciales para el avatar chico: "Nacho Pérez" → "NP", "Sofi" → "SF" (nombre único → sus 2 primeras letras). */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  return (words[0] ?? '').slice(0, 2).toUpperCase();
}
