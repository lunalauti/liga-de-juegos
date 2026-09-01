# Liga de Juegos — Requerimientos

> Fase 1 de 3 del spec-driven development. Nada de esto describe **cómo** se implementa (eso es `02-design.md`), sólo **qué** tiene que pasar.

---

## 1. Contexto y problema

Un grupo de amigos resuelve todos los días los juegos del diario La Nación y se comparte por WhatsApp cuánto tardó cada uno. Hoy ese registro:

- se pierde en el chat (no hay historial consultable),
- no tiene ranking automático (alguien tiene que sumar a mano),
- no tiene reglas escritas para el caso "no lo terminé",
- no permite comparar meses, rachas ni evolución.

**Objetivo:** una app web donde cada jugador carga su tiempo diario por juego, y el sistema arma automáticamente rankings por grupo y por período (semanal / mensual), con reglas de penalización claras.

## 2. Alcance

### Dentro del alcance (v1)

- Registro / login de usuarios.
- Creación de grupos y unión por código de invitación.
- **Carga del resultado pegando el link de "compartir" de La Nación** (importa tiempo, fecha, juego y si lo terminó), con carga manual como alternativa.
- Marcado de "no completado" con penalización automática.
- Ranking semanal y mensual por grupo, general y por juego.
- Historial y estadísticas personales.
- Uso en celular (mobile-first) — es donde se va a cargar el tiempo cada mañana.

### Fuera del alcance (v1)

- Sincronización automática sin intervención del jugador. La API de resultados de La Nación (ver `02-design.md` §9) sólo permite leer un resultado **puntual** a partir del id que se genera al tocar "compartir": no hay endpoint de listado ni forma de descubrir los ids. El jugador tiene que pegar el link, igual que hoy lo pega en el chat.
- Login con la cuenta de La Nación para leer resultados directamente (requeriría credenciales de terceros y el ranking oficial está detrás de su SSO).
- App nativa iOS/Android (la web responsive alcanza; se puede instalar como PWA más adelante).
- Chat interno, comentarios, reacciones.
- Verificación anti-trampa por screenshot/OCR (ver §8, decisión D3).
- Pagos, premios, apuestas.

## 3. Glosario

| Término | Definición |
|---|---|
| **Juego** | Uno de los puzzles diarios. v1: Crucigrama, Cruci Experto, Sudoku Avanzado. |
| **Resultado** (`entry`) | El tiempo de un jugador, en un juego, en una fecha (`puzzle_date`). |
| **DNF** | *Did Not Finish*: el jugador no completó el juego. Se registra con tiempo de penalización. |
| **Ausencia** | El jugador no cargó nada para ese juego/fecha. Distinto de DNF (ver §5.3). |
| **Grupo** | Conjunto de jugadores que compiten entre sí. Un usuario puede estar en varios. |
| **Temporada** (`season`) | Ventana de tiempo cerrada sobre la que se calcula un ranking. Semanal o mensual. |
| **Día de puzzle** | Fecha del diario a la que corresponde el juego, no la fecha de carga. |

## 4. Actores

- **Jugador**: carga sus tiempos, ve rankings e historial.
- **Admin de grupo** (quien lo creó): configura reglas del grupo, invita/expulsa miembros, edita resultados en disputa.

## 5. Requerimientos funcionales

Formato: `RF-x` con criterios de aceptación en formato EARS (*Cuando/Si… el sistema deberá…*).

### 5.1 Cuentas y acceso

**RF-1 — Registro e inicio de sesión**
- Cuando un visitante se registra con email y contraseña, el sistema deberá crear su cuenta y pedirle un nombre visible (*display name*).
- Cuando un visitante elige "Continuar con Google", el sistema deberá autenticarlo por OAuth sin pedir contraseña.
- Si el email ya existe, el sistema deberá informarlo sin revelar si la contraseña es correcta.
- El sistema deberá mantener la sesión iniciada entre visitas (token persistente) — nadie quiere loguearse todas las mañanas.

**RF-2 — Perfil**
- El jugador deberá poder editar su nombre visible y su avatar (emoji o imagen).
- El sistema deberá mostrar el nombre visible en todos los rankings.

### 5.2 Grupos

**RF-3 — Crear grupo**
- Cuando un jugador crea un grupo con nombre, el sistema deberá crearlo, asignarle el rol admin y generar un código de invitación único con formato legible al dictado (`CRUCI-84`: palabra corta derivada del nombre + guion + 2 dígitos), reintentando ante colisión.

**RF-4 — Unirse a un grupo**
- Cuando un jugador ingresa un código válido, el sistema deberá agregarlo como miembro.
- Si el código no existe o el grupo está archivado, el sistema deberá mostrar un error claro.
- Un jugador deberá poder pertenecer a varios grupos y cambiar entre ellos.

**RF-5 — Administrar grupo**
- El admin deberá poder: renombrar el grupo, regenerar el código, remover miembros, archivar el grupo.
- El admin deberá poder elegir qué juegos están activos en el grupo (subconjunto de los disponibles).
- El admin deberá poder configurar las reglas de puntuación del grupo (§5.5).
- El sistema deberá impedir que un admin se remueva a sí mismo si es el único admin.

### 5.3 Carga de resultados

**RF-6 — Importar resultado desde el link de La Nación** *(camino principal)*
- Cuando un jugador pega un link de resultado compartido de La Nación, el sistema deberá consultar la API de La Nación y precargar automáticamente: juego, nivel, fecha del puzzle, tiempo en segundos y si lo completó o no.
- El sistema deberá aceptar tanto la URL completa (`https://lanacion.agilmenteapp.com/shared/<id>`) como el id pelado.
- Si el resultado indica `FAIL`, el sistema deberá registrarlo como DNF (RF-7).
- Si el juego o nivel importado no está activo en el grupo, el sistema deberá avisarlo y no guardar nada.
- Si el mismo link ya fue importado —por quien sea— el sistema deberá rechazarlo indicando quién lo cargó. Un resultado, una carga.
- El sistema deberá guardar el identificador de usuario de La Nación que viene en el resultado y asociarlo al perfil la primera vez. Si después llega un link con otro identificador, el sistema deberá marcar el resultado como *no verificado* y avisar al grupo.
- Si la API de La Nación no responde o el link es inválido, el sistema deberá ofrecer la carga manual sin perder lo tipeado.
- El resultado importado deberá quedar marcado como **verificado** y mostrarse distinto de uno cargado a mano.

**RF-6b — Cargar tiempo manualmente** *(alternativa)*
- Cuando un jugador carga un tiempo para un juego y una fecha, el sistema deberá guardarlo y recalcular los rankings afectados.
- El sistema deberá aceptar el tiempo en formato `mm:ss` y también `hh:mm:ss`, y almacenarlo en segundos.
- El sistema deberá validar que el tiempo esté entre 1 segundo y el tiempo de penalización de ese juego (un tiempo peor que la penalización se carga como DNF, no aporta nada peor).
- Por defecto la fecha deberá ser **hoy** (zona horaria `America/Argentina/Buenos_Aires`).
- Un jugador deberá poder cargar los 3 juegos desde una única pantalla, sin navegar entre secciones.

**RF-7 — No completado (DNF)**
- Cuando un jugador marca un juego como no completado, el sistema deberá registrar el resultado con el tiempo de penalización configurado para ese juego y marcarlo visualmente como DNF.
- Valores por defecto: Crucigrama **20:00**, Cruci Experto **40:00**, Sudoku Avanzado **45:00**.

**RF-8 — Ausencias**
- Si al cerrar el día un jugador no cargó nada para un juego activo, el sistema deberá tratarlo, según la regla del grupo (§5.5):
  - `penalizar` (default): igual que un DNF.
  - `ignorar`: no suma ni resta, pero el jugador queda marcado como incompleto en ese día.
- El sistema deberá distinguir visualmente DNF (intentó, no terminó) de ausencia (no jugó).
- **"Al cerrar el día" es literal, no "en cualquier momento del día":** mientras el día en curso no haya terminado, un juego todavía sin cargar no penaliza — recién se evalúa como ausencia (según la regla de arriba) a partir del día siguiente. El motor original no respetaba esto (penalizaba el día en curso ni bien no había entry, sin esperar a que cerrara); corregido tras un caso real: alguien que cargó un solo juego del día veía su "Total mes" ya inflado con la penalización de los otros dos, todavía no vencidos.

**RF-9 — Editar y corregir**
- Un jugador deberá poder editar o borrar sus propios resultados dentro de las **48 horas** posteriores al día del puzzle.
- Pasadas las 48 h, sólo el admin del grupo deberá poder editarlos.
- El sistema deberá registrar en un log quién editó qué y cuándo, visible para los miembros del grupo (transparencia; ver §8, D3).

**RF-10 — Carga retroactiva**
- Un jugador deberá poder cargar resultados de días anteriores hasta 7 días atrás.
- El sistema deberá impedir cargar resultados con fecha futura.

### 5.4 Competencia y rankings

**RF-11 — Ranking por temporada**
- El sistema deberá calcular, para cada grupo y cada temporada (semana o mes), un ranking ordenado por **tiempo total acumulado ascendente** (menor es mejor), sumando todos los juegos activos.
- El sistema deberá mostrar además: tiempo por juego, cantidad de días jugados, cantidad de DNF, cantidad de victorias diarias.
- La semana deberá ir de **lunes a domingo**; el mes, del 1 al último día. Zona horaria Argentina.

**RF-12 — Ranking diario**
- El sistema deberá mostrar el ranking del día: quién fue más rápido en cada juego y en la suma del día.
- El sistema deberá otorgar una **victoria diaria** al de menor tiempo total del día entre quienes tienen el día completo.

**RF-13 — Modos de puntuación adicionales**

Además del tiempo total (modo default), el grupo deberá poder activar:

- **Puntos por posición (estilo F1)**: cada día, por juego, se reparten puntos según el orden de llegada (ej. 5-3-2-1-0…). Neutraliza los días catastróficos: un día pésimo cuesta lo mismo que un día apenas malo. Configurable por el admin.
- **Descartar los N peores días** (*drop worst*): al cerrar la temporada, se descartan los N peores días de cada jugador. Con `N = 2` mensual, nadie pierde el mes por irse de viaje o por un crucigrama imposible.
- **Cabeza a cabeza (H2H)**: por cada día y juego, el sistema deberá registrar el resultado contra cada rival, y mostrar una matriz "cuántas veces le gané a cada uno".

**RF-14 — Métricas complementarias** (siempre visibles, no definen al campeón)
- **Racha** (`streak`): días consecutivos con todos los juegos activos completados sin DNF. Se muestra la actual y la mejor histórica.
- **Consistencia**: desvío estándar del tiempo por juego. Premia al regular por encima del irregular.
- **Récord personal (PB)**: mejor tiempo histórico por juego; el sistema deberá destacarlo cuando alguien lo rompe.
- **Tasa de completado**: % de juegos terminados sin DNF sobre juegos disponibles.
- **Tiempos verificados**: cuántos de los resultados del jugador vinieron por link contra el total.
- **Mejora**: variación del tiempo promedio contra la temporada anterior.

**RF-15 — Desempates**
El sistema deberá desempatar en este orden: (1) más victorias diarias, (2) menos DNF, (3) mejor tiempo individual en la temporada, (4) orden alfabético.

**RF-16 — Cierre e historial de temporadas**
- Cuando termina una temporada, el sistema deberá congelar su tabla final y guardarla como histórico consultable.
- El sistema deberá mostrar un palmarés del grupo: cuántas temporadas ganó cada jugador.

### 5.5 Configuración del grupo

**RF-17** — El admin deberá poder configurar, por grupo:

| Setting | Default | Opciones |
|---|---|---|
| Juegos activos | los 3 | subconjunto de juegos disponibles |
| Penalización por juego | 20 / 40 / 45 min | cualquier valor en minutos |
| Período de competencia | mensual | semanal, mensual, ambos |
| Trato de ausencias | penalizar | penalizar, ignorar |
| Modo de puntuación | tiempo total | tiempo total, puntos por posición |
| Drop worst N | 0 | 0–5 |

Cambiar la configuración deberá recalcular la temporada en curso, nunca las cerradas.

### 5.6 Visualización

**RF-18 — Home**: al entrar, el jugador deberá ver de una sola mirada (a) si ya cargó lo de hoy, (b) su posición en la temporada en curso, (c) el podio del día.
**RF-19 — Historial personal**: evolución del tiempo por juego a lo largo del tiempo, en gráfico.
**RF-20 — Detalle de día**: para cualquier fecha, la grilla completa jugador × juego con los tiempos.

## 6. Requerimientos no funcionales

- **RNF-1 Performance**: cualquier pantalla deberá renderizar en < 2 s en 4G. El ranking se calcula en el servidor, no en el cliente.
- **RNF-2 Mobile-first**: el flujo de carga diaria deberá completarse en ≤ 3 toques desde el home.
- **RNF-3 Zona horaria**: toda la lógica de fecha usa `America/Argentina/Buenos_Aires`; se guarda en UTC.
- **RNF-4 Seguridad**: un jugador sólo puede ver datos de los grupos a los que pertenece, y sólo puede escribir sus propios resultados (salvo admin). Enforced en la base, no sólo en la UI.
- **RNF-5 Escala**: pensado para decenas de grupos de ≤ 20 personas. No requiere sharding ni cache distribuida.
- **RNF-6 Costo**: debe correr en los planes gratuitos de Supabase, Render y Vercel.
- **RNF-7 Accesibilidad**: contraste AA, navegable por teclado, labels en todos los inputs.
- **RNF-8 Idioma**: español rioplatense. Formato de tiempo `mm:ss`.

## 7. Criterios de aceptación del MVP

El MVP está listo cuando, con el sistema desplegado:

1. Tres personas distintas se registran, una crea un grupo y las otras dos entran con el código.
2. Cada una carga sus 3 tiempos del día, una de ellas marca un DNF.
3. El ranking del día muestra el orden correcto y el DNF suma la penalización correspondiente.
4. Al día siguiente, el ranking mensual acumula ambos días correctamente.
5. Un jugador corrige un tiempo de ayer y el ranking se actualiza.
6. Todo esto funciona desde el celular sin zoom ni scroll horizontal.

## 8. Decisiones abiertas (con default asumido)

| # | Pregunta | Default asumido | Impacto si cambia |
|---|---|---|---|
| D1 | ¿La competencia es semanal, mensual o las dos? | **Ambas**, con la mensual como principal | Bajo: es config de grupo |
| D2 | ¿Se compite en la suma de los 3 o también en cada juego por separado? | **Ambas cosas**: ranking general + un ranking por juego | Bajo |
| D3 | ¿Hace falta verificar los tiempos? | **Resuelto**: el link de La Nación es el comprobante. Lo importado queda marcado como verificado; lo manual, no | — |
| D7 | ¿Se permite cargar a mano, sabiendo que el link es verificable? | **Sí**, pero marcado como no verificado. El grupo puede exigir link (setting `require_verified`) | Bajo |
| D8 | ¿Qué pasa si La Nación cambia o corta la API? | La carga manual sigue funcionando; la app degrada, no se rompe | Medio |
| D4 | ¿Los grupos son privados o hay ranking global? | **Sólo privados** en v1 | Medio |
| D5 | ¿Se pueden agregar otros juegos del diario? | Sí, el catálogo de juegos es data, no código | Bajo |
| D6 | ¿Qué pasa si La Nación no publica un juego un día? | El admin puede marcar un día como anulado para el grupo | Bajo |
| D9 | ¿Qué pasa con un grupo si un admin borra su cuenta? | **Resuelto.** El rol de admin pasa al miembro más antiguo que quede en el grupo; si no queda nadie más, el grupo se borra. Aplica a cualquier admin, no sólo al creador original — si no, el mismo problema reaparece cuando se va un admin promovido después. `created_by` pasa a `NULL` en vez de bloquear el borrado (era la causa del error 500 encontrado en testing). Implementado en `supabase/migrations/0004_creator_departure.sql`, verificado contra Supabase real en los dos escenarios (con sucesor y sin nadie más). | — |
| D10 | ¿Un resultado importado con un tiempo real peor que la penalización se capea igual que en la carga manual? | **Resuelto: (b).** El tiempo real importado se guarda tal cual llega, sin capear contra la penalización — a diferencia de la carga manual (RF-6b), donde un tiempo peor que la penalización sí se convierte en DNF. Terminar tarde puede costar más que rendirse; es intencional, no un bug. El link es el comprobante real, y capearlo "escondería" un dato verificado. | — |
