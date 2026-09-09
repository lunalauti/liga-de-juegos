// Genera los íconos de la PWA (T10.1) a partir de tools/icon-source.svg.
// Corrida única, no forma parte del build — por eso `sharp` vive en las
// devDependencies de la raíz y no en apps/web.
//
//   node tools/generate-icons.mjs
//
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const svg = readFileSync(resolve(here, 'icon-source.svg'));
const outDir = resolve(here, '../apps/web/public');

const targets = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  // Maskable: el propio SVG ya deja ~21% de margen a cada lado (108/512), que
  // cae dentro de la "safe zone" del 80% central que pide la spec de íconos
  // maskable — no hace falta un source distinto.
  { file: 'icon-maskable-512.png', size: 512 },
  // No es parte del manifest — es el favicon de la pestaña del navegador y el
  // apple-touch-icon (index.html), que hasta ahora no existían en absoluto.
  { file: 'favicon-32.png', size: 32 },
  { file: 'apple-touch-icon.png', size: 180 },
];

for (const t of targets) {
  await sharp(svg, { density: 384 }).resize(t.size, t.size).png().toFile(resolve(outDir, t.file));
  console.log(`✓ ${t.file}`);
}
