# Prompt para Claude Design

> Copiá y pegá todo lo que sigue (desde la línea de `---`) en Claude Design.

---

Diseñá la UI de **Liga de Juegos**, una web app mobile-first donde un grupo de amigos argentinos registra cuánto tarda cada día en resolver los juegos del diario La Nación (Crucigrama, Cruci Experto, Sudoku Avanzado) y compite en un ranking semanal y mensual.

## Contexto de producto

Ocho amigos de entre 25 y 40 años que hoy se pasan los tiempos por WhatsApp cada mañana. El momento clave del producto son **90 segundos después de terminar el crucigrama**: abrir la app en el celular, cargar tres tiempos y ver si eso me movió en la tabla. Todo lo demás es secundario.

El tono es **competitivo entre amigos**: pican, celebran, cargan al que abandonó. No es una app corporativa de productividad ni una app de fitness gamificada con confeti. Es más cerca de una tabla de posiciones de fútbol amateur: seria con los números, con humor en el copy.

## Alcance del diseño

Entregá estas pantallas, mobile primero (390×844) y una vista desktop del ranking:

1. **Home** — Lo primero que se ve a la mañana. Arriba: card de estado del día ("Todavía no cargaste lo de hoy" con CTA grande, o los tres tiempos ya cargados con su posición del día). Abajo: mi posición en la tabla mensual (grande, con el delta vs. ayer) y el podio del día con los tres primeros.
2. **Cargar tiempos** — Los tres juegos en una sola pantalla, sin scroll si se puede. Cada juego: nombre, input de tiempo grande y numérico, y un toggle "No lo terminé" que reemplaza el input por la penalización correspondiente (20 / 40 / 45 min) claramente indicada como castigo. Selector de fecha discreto arriba (default: hoy). Un solo botón de guardar para los tres.
3. **Ranking** — Tabs Semana / Mes. Podio de los tres primeros con tratamiento visual propio, y debajo la tabla completa: posición, avatar, nombre, tiempo total, y desglose por juego. Mi fila siempre destacada. Chips secundarios por fila: cantidad de DNF, victorias del día, racha. Debe leerse de un vistazo en un celular sin scroll horizontal.
4. **Detalle del día** — Grilla jugador × juego con los tiempos de una fecha. El mejor tiempo de cada columna resaltado. Los DNF visiblemente distintos de las ausencias.
5. **Mis estadísticas** — Gráfico de líneas con la evolución del tiempo por juego, más tarjetas de: récord personal, racha actual, consistencia y % de completado.
6. **Grupo** — Lista de miembros, código de invitación grande y copiable con botón de compartir por WhatsApp, y el palmarés (quién ganó cada mes).
7. **Estados vacíos** — grupo recién creado sin datos, y día sin cargas todavía.

## Dirección visual

- **Anclaje conceptual:** el diario. Trabajá desde el vocabulario del papel de periódico y de la grilla del crucigrama —celdas, numeración en las esquinas, negro sobre blanco, reglas finas— pero llevado a algo digital y nítido, no a un skeuomorfismo de papel viejo. La grilla es el motivo estructural: úsala en fondos, separadores y en el tratamiento de las tarjetas.
- **Color:** base de neutrales cálidos tirando a papel (nada de gris azulado frío). Un color de acento **saturado y no obvio** —evitá azul y violeta genéricos de framework; probá un rojo tinta, un verde botella o un ámbar— usado con avaricia: sólo para el CTA principal, la posición propia y el líder. Un segundo acento sólo para señalar el DNF.
- **Tipografía:** una serif o slab de carácter editorial para números grandes, posiciones y títulos (los tiempos son el contenido protagonista: merecen tamaño y peso). Una sans neutra y legible para el resto. **Los tiempos siempre en cifras tabulares/monoespaciadas**, para que las columnas se alineen. Tracking apretado en los titulares grandes, interlineado holgado en el texto.
- **Densidad:** la tabla de ranking tiene que mostrar 8 filas sin scroll en un celular. Compacta, pero con jerarquía clara: el número de posición y el tiempo total dominan; el desglose por juego es secundario.
- **Profundidad:** superficies planas separadas por reglas finas y cambio de fondo, no por sombras difusas. Si usás sombra, que sea sutil y teñida del color base, nunca gris neutro.
- **Movimiento:** mínimo y con propósito. El único momento que merece una animación es guardar un tiempo y ver la fila moverse en la tabla.

## Restricciones técnicas

- Se implementa en **React con Bootstrap 5**, customizando las variables SCSS (`$primary`, `$font-family-base`, `$border-radius`, escala de espaciado) antes de importar Bootstrap. **No debe parecerse a Bootstrap default:** nada de azul `#0d6efd`, nada de botones y cards con el aspecto de fábrica. Diseñá algo que se pueda lograr sobrescribiendo esas variables más un CSS acotado.
- Mobile-first real: la carga diaria tiene que resolverse en 3 toques desde el home.
- Los inputs de tiempo van con `font-size: 16px` mínimo (si no, iOS hace zoom) y teclado numérico.
- Contraste AA en todo, foco visible en todo lo interactivo, y estados de hover / focus / active / disabled definidos.
- Todos los textos en **español rioplatense** (voseo). Tiempos en `mm:ss`.

## Qué entregar

Las 7 pantallas en alta fidelidad, más: la paleta con sus roles, la escala tipográfica, y las variantes de los componentes que se repiten (fila de ranking, card de juego en la carga, chip de estado, badge de posición). Mostrá al menos un estado de error o vacío por pantalla clave.

**No agregues** funcionalidad que no esté en esta lista: nada de chat, feed social, apuestas, monedas virtuales, ni logros con confeti.
