# Diseño de UI

El diseño vive en Claude Design y es la **fuente de verdad de la interfaz**:

- Proyecto: `6789cec9-c5e4-4872-9b7b-aacb0d193ba3`
- Archivo principal: `Liga de Juegos.dc.html` (importa `support.js`)
- https://claude.ai/design/p/6789cec9-c5e4-4872-9b7b-aacb0d193ba3

## Regla de trabajo

Igual que con las specs: **primero el diseño, después el código.** Si una pantalla necesita cambiar, se cambia en el canvas y recién ahí se implementa. Un cambio de UI que no pasó por el diseño es deuda, no una mejora.

## Qué va en esta carpeta

```
design/
├── Liga de Juegos.dc.html   # export del canvas (11 artboards mobile + desktop del ranking + sistema)
├── support.js               # runtime del canvas, generado — no se edita
├── tokens.md                # paleta con roles, tipografía, forma, espaciado y movimiento
└── tokens.scss              # los mismos tokens como override de Bootstrap, listo para copiar
```

`tokens.scss` va a `apps/web/src/styles/_variables.scss` (T0.7) y es lo único que el código consume. Nadie debería estar sacando colores a ojo del canvas: salen de ahí.

## Artboards

| # | Contenido |
|---|---|
| 01 | Home, dos estados: todavía no cargó / ya cargó los tres |
| 02 | Cargar: link pegado con preview, error de link repetido, a mano desplegado |
| 03 | Ranking: mobile semana/mes y desktop 1280 |
| 04 | Detalle del día · Mis estadísticas · Grupo |
| 05 | Estados vacíos: grupo recién creado y día sin cargas |
| 06 | Sistema: paleta, tipografía y variantes de componentes |

## Cómo actualizar la copia local

Desde una terminal interactiva de Claude Code en esta máquina:

```bash
claude
```

y adentro `/design-login` una vez. Después, esta sesión (y las headless) pueden leer el proyecto con la herramienta DesignSync.
