#!/usr/bin/env node
// Recorta un pedazo del canvas a una página HTML estática, para comparar la
// implementación contra el diseño (T0.8 y T9.0). El runtime del canvas usa su propio
// viewport y no se deja screenshotear, así que se renderiza el markup pelado.
//
// Uso: node tools/design-ref.mjs "Componentes que se repiten" [salida.html]

import { readFileSync, writeFileSync } from 'node:fs';

const SRC = new URL('../design/Liga de Juegos.dc.html', import.meta.url);
const FONTS =
  'https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,600;6..72,700' +
  '&family=Archivo:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap';

const anchor = process.argv[2] ?? 'Componentes que se repiten';
const out = process.argv[3] ?? 'design-ref.html';

const src = readFileSync(SRC, 'utf8');
const at = src.indexOf(anchor);
if (at === -1) {
  console.error(`No encontré "${anchor}" en el canvas.`);
  process.exit(1);
}

const start = src.lastIndexOf('<div', src.lastIndexOf('<span', at));
const body = src
  .slice(start, src.indexOf('</x-dc>'))
  .replace(/<script.*?<\/script>/gs, '')
  .replace(/\sstyle-(hover|active|focus)="[^"]*"/g, '')
  .replace(/\{\{[^}]*\}\}/g, '');

writeFileSync(
  out,
  `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Referencia · ${anchor}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${FONTS}" rel="stylesheet">
<style>body{margin:0;background:#EDE7DA;font-family:Archivo,system-ui,sans-serif;padding:24px;width:760px}</style>
</head><body>${body}</body></html>`,
);
console.log(`${out} listo — abrilo al lado de /kitchen-sink y compará.`);
