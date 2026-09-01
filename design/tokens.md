# Tokens de diseño

Extraídos de `Liga de Juegos.dc.html`, sección **Sistema** (artboard 06). Esta es la traducción normativa del canvas al código: lo que está acá se implementa en `apps/web/src/styles/_variables.scss` (ver `tokens.scss`, listo para copiar). **Nadie saca colores a ojo del canvas.**

## Paleta y roles

| Hex | Rol | Uso |
|---|---|---|
| `#16513C` | `$primary` — verde botella | CTA principal, mi fila, líder, links |
| `#0F3D2D` | primary hover / active | — |
| `#A8352A` | `$danger` — rojo tinta | **Sólo** DNF y errores de carga |
| `#C9A227` | ámbar de foco | Anillo `outline: 3px solid` en todo lo interactivo |
| `#14120E` | tinta | Texto, reglas fuertes, borde de card destacada |
| `#4A4438` | texto secundario | Cumple AA sobre papel |
| `#6B6357` | etiquetas y metadatos | — |
| `#DDD6C8` | regla fina | Todos los bordes de 1px |
| `#F1EBDD` | fondo secundario | Encabezados de tabla y barra inferior |
| `#F6F2EA` | papel | Fondo de la app |
| `#FFFFFF` | superficie | Cards. Sin sombra difusa: se separan por regla + cambio de fondo |

Auxiliares que aparecen en el canvas: `#FBF8F1` (superficie de input), `#E7E0D2` / `#C9C0AC` / `#B3AA98` (reglas y estados apagados), `#8C8271` / `#A9A091` (texto deshabilitado), `#EFF4EF` (fondo de éxito), `#FCF2F0` (fondo de error), `#E8F0EA` (flash de fila al guardar).

**Regla dura:** el verde es escaso. Si aparece en más de dos lugares de una pantalla, algo se rompió.

## Tipografía

Tres familias, de Google Fonts: `Newsreader` (display serif), `Archivo` (sans de UI), `IBM Plex Mono` (tiempos y etiquetas).

| Rol | Familia | Peso | Tamaño | Notas |
|---|---|---|---|---|
| Display | Newsreader | 600 | 52 / 48 px | tracking `-0.04em` — posición y total del mes |
| Título de card | Newsreader | 600 | 26–29 px | — |
| **Tiempos** | IBM Plex Mono | 600 | 24 px en carga, 17 px en tabla | `font-variant-numeric: tabular-nums` **siempre** |
| UI fuerte | Archivo | 600 | 15 px | nombres, botones |
| Cuerpo | Archivo | 400 | 13–15 px | interlineado 1.6–1.7 |
| Etiqueta | IBM Plex Mono | 400–600 | 9–10 px | tracking `.16em`, mayúsculas |

Inputs de tiempo: **16 px reales como mínimo** (se ven a 24 px) para que iOS no haga zoom, con `inputmode="numeric"`.

## Forma y profundidad

- **`border-radius: 0` en todo.** La grilla del crucigrama no tiene esquinas redondeadas. Esto hay que forzarlo en Bootstrap, que redondea por defecto.
- Bordes de 1 px `#DDD6C8`; 1.5 px `#14120E` para lo destacado (badge de posición, card en foco).
- Mi fila y la del líder llevan `border-left: 4px solid #16513C`.
- Una sola sombra en todo el sistema: `0 18px 40px rgba(60,48,30,.13)`, y sólo para lo que flota de verdad.
- Foco: `outline: 3px solid #C9A227; outline-offset: 2px` (1 px en elementos chicos). No se remueve nunca.

## Espaciado

Escala observada en gaps: **4 · 8 · 12 · 14 · 16 · 20 · 24 · 32 · 64**. Padding de controles: `12–14px` vertical, `14–20px` horizontal.

## Movimiento

Sólo una animación en todo el producto: `rowIn` — al guardar un tiempo, la fila entra desde `translateY(14px)` con fondo `#E8F0EA` que se desvanece. Nada más se mueve.
