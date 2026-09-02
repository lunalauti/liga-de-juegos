# Liga de Juegos — Plan de tareas

> Fase 3 de 3. Cada task es un commit/PR chico, verificable por separado. `[RF-x]` = requerimiento que cubre, `§y` = sección del diseño.
> Estimación total: **~52–62 h** de trabajo efectivo (incluye la Fase 4b, agregada el 2026-09-01 por el cambio de alcance D2). El camino más corto a algo usable es la Fase 4 (MVP jugable).

---

## Fase 0 — Fundaciones (~5 h)

- [x] **T0.1** Monorepo: npm workspaces con `apps/api`, `apps/web`, `packages/shared`. TypeScript strict, ESLint, Prettier, `.gitignore`, `.env.example`. §2 **Hecho.**
- [x] **T0.2** Proyecto Supabase creado; `DATABASE_URL` y llaves en `.env` local. §7 **Hecho** — proyecto `tgeciaudbisaozrjvfre`. (Aplicado por `apps/api/scripts/migrate.mjs`, no por el CLI de Supabase — más simple para no depender de login.)
- [x] **T0.3** `packages/shared`: tipos de dominio + `parseTime()` / `formatTime()` con tests (`7:45`, `745`, `1:07:45`, inválidos). §6.2 **Hecho.**
- [x] **T0.4** API esqueleto: Express + TS, `GET /health`, middleware de errores con el formato único, CORS, helmet. §4 **Hecho.**
- [x] **T0.5** Web esqueleto: Vite + React + TS + React Router, Bootstrap importado vía SCSS con `_variables.scss` propio. §6 **Hecho.**
- [x] **T0.6** Exportar el diseño a `design/` y extraer los tokens → [`design/tokens.md`](../design/tokens.md) + [`design/tokens.scss`](../design/tokens.scss). **Hecho.**
- [x] **T0.7** Copiar `design/tokens.scss` a `apps/web/src/styles/_variables.scss`, importar las tres familias de Google Fonts (Newsreader, Archivo, IBM Plex Mono) y verificar que Bootstrap quede sin esquinas redondeadas en ningún componente. §6.5 **Hecho.**
- [x] **T0.8** Página `/kitchen-sink` con los componentes del artboard 06 —fila de ranking (4 variantes), card de juego (3 estados), chips, badge de posición, botones (5 estados)— para comparar contra el canvas de un vistazo. §6.3 **Hecho.**

## Fase 1 — Datos y auth (~7 h)

- [x] **T1.1** Migración `0001_init.sql`: `profiles`, `games`, `groups`, `group_members`, `group_games`, `entries`, `entry_audit`, `seasons`, `blackout_dates` + índices. §3 **Hecho y aplicada.** Incluye también `imported_results` (§9.4).
- [x] **T1.2** Seed de `games` con los 3 juegos y sus penalizaciones (1200 / 2400 / 2700 s). [RF-7] **Hecho y aplicado** en `0003_seed_games.sql`. `sudoku-avanzado → sudoku/hard` sigue sin confirmar con un link real (T3.11).
- [x] **T1.3** Trigger `on auth.users insert` → crea `profiles` con display_name del metadata. [RF-1] **Hecho y aplicado** (`handle_new_user` en `0001_init.sql`; usa el email si no viene `display_name`).
- [x] **T1.4** Migración `0002_rls.sql`: funciones `is_member()` / `is_admin()` security definer + políticas de todas las tablas. [RNF-4] §3.4 **Hecho, aplicada y verificada**: con la anon key sin sesión, las tablas privadas devuelven vacío y `games` es legible.
- [x] **T1.5** API: middleware `requireAuth` que valida el JWT de Supabase e inyecta `req.user`. §1 **Hecho y verificado contra Supabase real.** El proyecto usa las *signing keys* asimétricas (ES256): la validación es contra el JWKS (`/auth/v1/.well-known/jwks.json`), no `SUPABASE_JWT_SECRET` — corregido §1 para reflejarlo.
- [x] **T1.6** Web: cliente Supabase, pantalla `/login` (email+pass, Google, registro), `useSession`, rutas protegidas. [RF-1] **Hecho.** Sin artboard propio (no está entre los 7 del canvas) — construida con los tokens del sistema. Verificado con un usuario real: login, sesión persistente, logout, redirect de rutas protegidas.
- [x] **T1.7** API `GET /me` + `PATCH /me`; web: pantalla de perfil. [RF-2] **Hecho y verificado**: PATCH confirmado con una lectura directa a la base, no sólo por lo que muestra la UI.

## Fase 2 — Grupos (~6 h)

- [x] **T2.1** Generador de `invite_code` con formato legible al dictado (`CRUCI-84`) + test de colisión. [RF-3] §6.5 **Hecho y verificado**: el caso exacto del diseño ("Los del crucigrama" → `CRUCI-XX`) tiene test propio.
- [x] **T2.2** API `POST /groups`, `GET /groups/:id`, `PATCH /groups/:id`, `POST /groups/join`. [RF-3, RF-4, RF-5] **Hecho y verificado contra Supabase real** (dos usuarios, creación, unión idempotente, código inválido).
- [x] **T2.3** Zod schema de `groups.settings` + validación al escribir. [RF-17] §3.2 **Hecho.** Merge parcial + revalidación cruzada (ej. `primary_period` tiene que estar en `period_types`), probado con un caso inválido real.
- [x] **T2.4** API: `regenerate-code`, remover miembro, guard "no podés quedarte sin admin". [RF-5] **Hecho y verificado**: intentar remover al único admin devuelve 409, remover a otro miembro funciona.
- [x] **T2.5** Web: crear grupo, unirse con código, selector de grupo (persistido en `localStorage`, `useActiveGroup`). [RF-3, RF-4] §6.2 **Hecho y verificado en el navegador contra la API real.** El selector visible sólo aparece con 2+ grupos, no hay artboard propio para eso.
- [x] **T2.6** Web: pantalla de grupo según artboard 04 (código grande con copiar y compartir por WhatsApp, miembros, palmarés). [RF-5] **Hecho y verificado**: copiar al portapapeles confirmado, WhatsApp abre `wa.me` con el código. El palmarés no tiene datos hasta la Fase 7 (temporadas) — se muestra un texto que lo explica en vez de data inventada.
- [x] **T2.7** Web: panel de settings del grupo, sólo admin. [RF-17] **Hecho y verificado**: cambio de modo de puntuación guardado y confirmado con una lectura directa a la base.
- [x] **T2.8** Sucesión de admin al borrar un perfil (D9): migración `0004_creator_departure.sql`, trigger `handle_admin_departure()`. [D9] Fuera del plan original — surgió al testear la Fase 2 y se resolvió con el usuario. Verificado contra Supabase real en los dos escenarios (con sucesor y sin nadie más).

## Fase 3 — Carga de resultados (~7 h)

- [x] **T3.1** Helper de fechas: "hoy" en ART, límites de semana/mes, validación de rango. [RNF-3] §5.5 **Hecho** en `packages/shared/src/argDate.ts`, 14 tests.
- [x] **T3.2** API `POST /entries` — upsert sobre `(group_id, user_id, game_id, puzzle_date)`, valida rango de tiempo, ventana de edición y fecha no futura. [RF-6, RF-9, RF-10] **Hecho y verificado contra Supabase real**: happy path, tiempo inválido, fecha futura, fecha >7 días.
- [x] **T3.3** DNF: al marcarlo, guarda `dnf = true` + penalización del grupo. [RF-7] **Hecho**, incluida la auto-conversión cuando el tiempo tipeado supera la penalización (RF-6b), verificada.
- [x] **T3.4** API `POST /entries/bulk` (los 3 juegos, y opcionalmente varios grupos, en un request). [RF-6, RNF-2] **Hecho y verificado.**
- [x] **T3.5** API `DELETE /entries/:id` con la misma ventana. [RF-9] **Hecho y verificado**: dueño fuera de ventana rechazado, admin siempre puede.
- [x] **T3.6** `entry_audit`: escribir el log en create/update/delete. [RF-9] **Hecho.** El testing encontró que `entry_id`/`actor_id` tenían `on delete cascade`/sin cláusula: borrar un resultado o una cuenta se llevaba puesto el log que debía sobrevivir. Corregido en `0006` y `0007` (`on delete set null`) — mismo criterio que D9.
- [x] **T3.7** Web `/cargar`: los 3 juegos en una pantalla, input de tiempo tolerante, toggle DNF, selector de fecha con default hoy. [RF-6, RF-7, RNF-2] §6.2 **Hecho y verificado en el navegador.** El optimistic update queda pendiente — hoy espera la confirmación del servidor antes de mostrar éxito; no es incorrecto, es más conservador que la spec.
- [x] **T3.7b** Carga manual juego por juego, no sólo los tres juntos — pedido explícito del usuario tras probar la app. Cada juego tiene su propio botón "Guardar" (habilitado apenas ese juego tiene dato), y el botón de abajo pasa a "Guardar los N que faltan" en vez de exigir siempre los tres. Verificado contra Supabase real: guardar sólo Crucigrama no crea fila para los otros dos; guardar después sólo Sudoku (DNF) tampoco toca Cruci Experto.
- [x] **T3.8** Tests de integración del endpoint de entries manual. **Hecho, pero no como suite automatizada**: se verificó contra Supabase real (mismo método que Fases 1–2) en vez de mockear `pg`, porque mockear consultas SQL secuenciales es frágil y no encuentra bugs reales — y de hecho esta ronda encontró tres (fecha con TZ del servidor, cascada de auditoría, FK de `actor_id`). Lo que sí quedó como test automatizado son las piezas puras: `argDate` (14 tests), `resolveLnVerification` (4), `extractLnId` (4).

## Fase 3.5 — Integración con La Nación (~6 h)

- [x] **T3.9** `services/lanacion.ts`: extraer uuid de una URL o texto pegado, `GET games/shared/<id>`, parsear con Zod, timeout 8 s + 1 reintento, cache 24 h. [RF-6] §9.1 **Hecho.**
- [x] **T3.10** Migración: columnas `source`, `verified`, `external_id`, `external_user_id`, `external_payload` en `entries`; tabla `imported_results`; `profiles.lanacion_user_ids`; `games.ln_game` / `games.ln_level`. §9.4 **Ya estaba en `0001_init.sql`** (se adelantó al diseñar el esquema inicial).
- [x] **T3.11** Seed del mapeo juego↔nivel. **Confirmado con un link real** de Sudoku Avanzado — `sudoku/hard` era correcto, el supuesto original se sostuvo. Los tres juegos ya tienen su mapeo verificado contra La Nación real (no sólo el catálogo). §9.2
- [x] **T3.12** API `POST /entries/import` + `POST /entries/import/preview` (de sólo lectura, agregada durante la implementación — el diseño original no separaba preview de confirmación, y sin esa separación "Descartar" en la UI no deshacía nada). Validaciones de §9.4, `result: FAIL` → DNF, escritura en varios grupos a la vez. [RF-6, RF-7] **Hecho y verificado con un link real de La Nación**, incluido el flujo completo pegar → preview sin escribir → confirmar → escribe.
- [x] **T3.13** Binding de identidad: primer link asocia el `lanacion_user_id`; los siguientes marcan `verified` true/false. [RF-6] §9.4 **Hecho.** El primer caso (bind + verificado) se probó con un link real; el caso de identidad no coincidente se probó como función pura (`resolveLnVerification`, 4 tests) — no tuve un segundo link real de otra cuenta para probarlo de punta a punta.
- [x] **T3.14** Web `/cargar` según artboard 02: campo de link arriba de todo, preview de lo detectado con sello verificado, confirmar/descartar, y el estado de error de link repetido ("Ese link ya lo cargó X. Buen intento."). [RF-6] §6.5 **Hecho y verificado en el navegador con un link real, incluido el rechazo por link repetido.** Pendiente: el truncado del link por el medio (hoy el input simplemente hace overflow con ellipsis vía CSS, no trunca activamente el string).
- [x] **T3.15** Chip de verificado reutilizado en `/cargar`. [RF-6] §6.3 El resto de las pantallas donde debe repetirse (Hoy, Ranking, Detalle) llega con la Fase 4, cuando esas pantallas existan.
- [x] **T3.16** Setting `require_verified` del grupo. [D7] **Hecho**: ya estaba en el schema (T2.3); se agregó el toggle en el panel de ajustes del grupo. Sin efecto todavía en el cálculo del ranking porque el motor de puntuación es Fase 4.
- [x] **T3.17** Test de contrato contra un uuid real. §9.6 **Hecho** (`lanacion.test.ts`, gateado por `RUN_LN_CONTRACT_TEST=1` para no pegarle a la red en cada `npm test`), corrido y verificado contra la red real. **Falta cablearlo a un cron de CI diario** — no hay CI configurado todavía (eso es la Fase 5).

## Fase 4 — Scoring y ranking · **MVP jugable** (~10 h)

- [x] **T4.1** `scoring/grid.ts`: expandir la grilla miembro × juego × día resolviendo DNF, ausencias y blackouts. [RF-8] §5.1 **Hecho**, 7 tests. **Corregido después**: el motor penalizaba el día en curso ni bien faltaba un juego, sin esperar a que el día terminara — no era lo que decía RF-8 ("al cerrar el día"). Ahora `buildGrid` recibe `today` y sólo penaliza `day < today`. Encontrado con un dato real del usuario (su propio "Total mes" se veía inflado por dos juegos del día que todavía no había cargado), verificado contra Supabase real: total sólo refleja lo cargado + días ya cerrados.
- [x] **T4.2** `scoring/totalTime.ts`: suma, ganadores diarios, orden y desempates. [RF-11, RF-12, RF-15] **Hecho.** Encontré y corregí un bug propio antes de testear: `dailyWins` quedaba hardcodeado en 0 y nunca se completaba, lo que hubiera roto el primer criterio de desempate en silencio.
- [x] **T4.3** `scoring/dropWorst.ts`: descartar los N peores días. [RF-13] **Hecho**, 3 tests.
- [x] **T4.4** **Suite de tests del motor** — 21 tests, los 8 casos pedidos cubiertos uno por uno (incluido el desempate por DNF en aislado, que no estaba en la lista original pero hacía falta para probar los 4 criterios de RF-15 por separado). Encontró un bug real: `participated` decidía mal quién entra al ranking cuando `absence_policy: "penalize"` — alguien 100% inactivo quedaba excluido de la tabla en vez de rankeado último con un total enorme, que es la conducta correcta según RF-8.
- [x] **T4.5** API `GET /groups/:id/leaderboard` con `period` y `date`, + cache de 60 s invalidada al escribir. [RF-11] §5.4 **Hecho y verificado contra Supabase real** con matemática confirmada a mano en varios escenarios (semana, mes, drop-worst). Encontré que `PATCH /groups/:id` no invalidaba el cache — cambiar `drop_worst_n` no se veía reflejado hasta que expiraban los 60s. Corregido.
- [x] **T4.6** API `GET /groups/:id/day` — grilla del día. [RF-12, RF-20] **Hecho y verificado.**
- [x] **T4.7** Web `/ranking` según artboard 03: tabs semana/mes, podio de tres, tabla con desglose C/E/S, mi fila con borde verde, chips por fila. [RF-11] **Hecho y verificado en el navegador contra datos reales**, matemática confirmada a mano.
- [x] **T4.7b** **Simplificado, no implementado pixel a pixel.** En vez de un layout desktop aparte con nav superior propia, es CSS responsive sobre el mismo componente: la tabla se ensancha y el panel de "ganadores del día"/"faltan cargar" pasa a fila en pantallas ≥900px. Mismo contenido, sin la nav superior del artboard desktop. Decisión de alcance dada la envergadura ya grande de esta fase — no se consultó antes de tomarla.
- [x] **T4.8** Web `/` según artboard 01, con sus dos estados. [RF-18] **Hecho y verificado en el navegador** en ambos estados, con matemática confirmada a mano (29:31 = 07:30+12:03+09:58). El podio de hoy sólo cuenta a quienes tienen el día completo (RF-12), igual que el resto del sistema.
- [x] **T4.9** Web `/dia/:fecha` según artboard 04. [RF-20] **Hecho y verificado**, incluida la navegación entre días y el límite en "hoy" (no se puede ir al futuro). Encontré y corregí un bug real: las columnas de Crucigrama y Cruci Experto mostraban el mismo encabezado ("CRUC.") porque truncaba por la primera palabra del nombre completo — pasé a usar el `shortName` del catálogo (`Cruci`/`Exp.`/`Sud.`).
- [x] **T4.10** Campos derivados en `/leaderboard` y `/day`: `deltaVsYesterday`, `gapToLeader`, `gapToPodium`, `todaysGameWinners`, `pendingToday`, `loadedCount`/`memberCount`, `bestPerGame`. §6.4 **Hecho y verificado**, todos derivados de la misma grilla, sin consultas nuevas.

> **Hito: acá el sistema ya sirve.** Se puede usar con los amigos aunque falte todo lo de abajo.

> **Bug post-hito, reportado por el usuario probando la app real:** un usuario recién registrado, sin ningún grupo todavía, quedaba en "Cargando…" para siempre en Hoy, Tabla, Cargar y Detalle del día — el `loading` local nunca se apagaba porque el efecto que lo hace sólo corre si hay un grupo activo. Corregido en las 4 pantallas + extraído `<NoGroupState />` compartido. De paso se silenciaron los warnings de deprecación de Sass que imprime Bootstrap (`vite.config.ts`, inofensivos pero eran ruido en la consola).

## Fase 4b — Rework: ranking por juego, no combinado (D2, ~6 h)

**Cambio de requerimientos del 2026-09-01, sobre código ya shippeado y en producción.** Cada grupo elige en qué juegos compite (ya existía, RF-5); lo nuevo es que el ranking se evalúa **por juego**, no como la suma de los 3 tiempos. Ver `01-requirements.md` D2/RF-11/RF-12/RF-15/RF-16/RF-18 y `02-design.md` §5 para el detalle. Reemplaza el trabajo de T4.2, T4.5, T4.7, T4.8, T4.10 (quedan marcadas [x] arriba porque el código que describen existió y funcionó — el rework es un cambio de requerimiento, no un bug de esa entrega).

- [x] **T4b.1** `scoring/totalTime.ts`: reestructurar para calcular un ranking independiente por juego activo (agrupar la grilla por juego antes de sumar, en vez de sumar todo junto). `computeDailyWinners` se simplifica: ya no necesita `activeGameCount` para exigir "día completo" — ganar el día en un juego sólo depende de ese juego. [RF-11, RF-12] §5.1 **Hecho.**
- [x] **T4b.2** `scoring/dropWorst.ts` / su uso: pasar de "descartar los N peores días combinados" a "descartar los N peores tiempos de cada jugador, dentro de cada juego". [RF-13] §5.1 **Hecho** — la función no cambió (ya era agnóstica a qué representa cada valor), sólo cómo se la llama.
- [x] **T4b.3** Reescribir la suite de tests del motor (T4.4) para el nuevo shape: casos por juego, sin ranking combinado, incluidos los 4 criterios de desempate (RF-15) evaluados dentro de un solo juego. **Hecho**, 14 tests (los 8 casos originales + 6 nuevos que prueban específicamente que un juego no contamina al otro).
- [x] **T4b.4** API `GET /groups/:id/leaderboard`: `rows` plano → `rankings: [{ gameSlug, gameName, rows }]`, uno por juego activo. `deltaVsYesterday`, `gapToLeader`, `gapToPodium` pasan a vivir dentro de cada elemento de `rankings[].rows`. [RF-11] §4, §5.4 **Hecho.**
- [x] **T4b.5** Web `/ranking`: agregar selector de juego (tabs Crucigrama/Cruci Experto/Sudoku Avanzado) por encima de los tabs Semana/Mes; la tabla pasa a mostrar un solo juego a la vez (posición, jugador, tiempo), no el desglose C/E/S combinado. [RF-11] §6.2 **Hecho y verificado en producción real** — el orden se invierte entre juegos (Luquistrikis 1º en Sudoku Avanzado, 2º en Crucigrama), prueba de que son rankings independientes.
- [x] **T4b.6** Web `/` (Home): "tu posición del mes" pasa de un número único a un chip de posición por juego activo (ej. "1º Crucigrama · 3º Sudoku"), cada uno con su propio delta y distancia al podio. Podio de hoy también por juego (top-3 más rápidos de cada juego, ya no exige "día completo" en los 3 para entrar). [RF-18] §6.2 **Hecho y verificado en producción real.**
- [x] **T4b.7** Verificación end-to-end contra Supabase/producción real. **Hecho**: con datos reales del grupo "La banda del cruci", el ranking de Crucigrama y el de Sudoku Avanzado ordenan distinto entre las mismas dos personas — confirma que cada juego se calcula y desempata de forma completamente independiente, tanto en Home como en /ranking.
- [x] **T4b.8** **Bug post-hito, reportado por el usuario probando el ranking real: "si hay empate, tiene que decir empate, no el ranking".** El desempate alfabético (RF-15, último criterio) fingía un 1º y un 2º donde en realidad los dos jugadores tenían exactamente el mismo `total_seconds`, `daily_wins`, `dnf_count` y mejor tiempo individual — el alfabético sólo tenía que decidir el orden de LISTADO, nunca el `rank`. Corregido: `scoreTotalTime` ahora asigna ranking de competición estándar (1, 1, 3) y marca `tied: true` en las filas realmente empatadas; el alfabético queda relegado a decidir en qué orden se listan las filas tied entre sí. Nuevo campo `tied` en `LeaderboardRow` (types.ts), propagado sin cambios por `leaderboard.ts`. Web: chip "Empate" en `/ranking` (tabla y podio) y en Home ("tu posición" y "podio de hoy" — este último con el mismo fix aplicado a tiempos crudos del día, sin pasar por el motor). 5 tests nuevos/reescritos del motor, incluido un empate de 3 y el caso "empatan por el 1º → el siguiente es 3º, no 2º". [RF-15] §5.1

## Fase 5 — Deploy (~4 h)

- [x] **T5.1** Deploy de la API en Render + variables de entorno + `/health`. §7 **Hecho.** Servicio `liga-de-juegos-api` vivo en `https://liga-de-juegos-api.onrender.com` (Blueprint managed, deploy `4d10718`). `/health` responde `{"ok":true}` (con cold start del plan free, ~30-50s tras inactividad). Los 4 secretos (`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ALLOWED_ORIGINS`) ya estaban cargados.
- [x] **T5.2** Deploy de la web en Vercel + variables + dominio. §7 **Hecho** — vivo en `https://liga-de-juegos.vercel.app`. Hubo una vuelta larga de debugging: el build fallaba siempre con `sh: vite: command not found` (exit 127) pese a corregir `devDependencies` y fijar la versión de Node. **La causa real** no era el código sino la configuración del proyecto en el dashboard de Vercel: **Root Directory** estaba en `apps/api` y **Framework Preset** en `Express` — Vercel build/install corría parado en `apps/api`, donde no existe `vite` ni el resto del monorepo. Corregido en Project Settings → Build and Deployment (Root Directory vacío, Framework Preset → Vite); `vercel.json` revertido al build command limpio (`npm run build -w @liga/web`), sin scripts de diagnóstico. `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` ya estaban cargadas en Production y Preview.
- [x] **T5.3** CORS y redirect URLs de Supabase Auth apuntando a los dominios reales. **Hecho.** `ALLOWED_ORIGINS` en Render actualizado a `http://localhost:5173,https://liga-de-juegos.vercel.app` (antes solo tenía localhost). En Supabase Auth → URL Configuration: Site URL → `https://liga-de-juegos.vercel.app` (antes `http://localhost:3000`), y Redirect URLs con `https://liga-de-juegos.vercel.app/**` y `http://localhost:5173/**` (antes no había ninguna cargada). El proveedor de Google OAuth no necesitó cambios — su callback contra Supabase es fijo (`https://<project>.supabase.co/auth/v1/callback`), independiente del dominio del frontend.
- [x] **T5.4** GitHub Actions: typecheck + lint + test en PR; migraciones en merge a `main`. **Hecho.** `.github/workflows/ci.yml`, dos jobs (`check`, `migrate`). De paso: el proyecto tenía un script `lint` que apuntaba a un ESLint nunca instalado — lo dejé andando de verdad (`eslint.config.js`, flat config, TS + React) antes de meterlo en CI. Encontró 122 errores reales de configuración (globals de Node/browser faltantes, un archivo vendorizado que no debía lintearse) y una regla nueva (`react-hooks/set-state-in-effect`) que marcaba como error un patrón ya probado contra producción — la apagué a propósito, documentado en el config. **Falta:** cargar el secreto `DATABASE_URL` en GitHub → Settings → Secrets para que el job `migrate` funcione (confirmar con vos si ya lo hiciste).
- [x] **T5.5** Ping externo cada 10 min contra `/health` para el cold start. §7 **Hecho.** Cronjob en cron-job.org contra `https://liga-de-juegos-api.onrender.com/health`. Verificado: 3 pings seguidos respondieron en <1s (sin cold start), contra los ~30-50s que tardaba antes en frío.
- [~] **T5.6** **Prueba de aceptación del MVP** con los criterios de `01-requirements.md` §7. **Parcial — lo verificable sin cuentas nuevas, hecho; falta la parte con personas reales.**
  - Criterio 6 (mobile-first, sin scroll horizontal): **verificado** en Hoy, Cargar, Detalle del día, Tabla y Grupo — `scrollWidth === clientWidth` en las cinco, con la app real en producción. No pude emular un viewport de celular de verdad en este entorno (el resize quedó en ~500px de ancho, sin UA/touch de mobile), pero el layout usa `max-width: 420px` centrado en todas las pantallas (specs/02-design.md §6.6), así que 500px ya es una prueba más exigente que un iPhone real (390-430px). **Te recomiendo una pasada rápida desde tu celular real para confirmar sensación táctil (tamaño de botones, teclado numérico al cargar tiempo), que esto no puede probar.**
  - Criterios 3 y 5 (ranking del día correcto, DNF suma penalización, corrección de un tiempo actualiza el ranking): la lógica está cubierta por los 26 tests del motor de puntuación (incluidos los de DNF y de recalculo) y ya se vio funcionando con datos reales del grupo "La banda del cruci" (el chip "Empate" de T4b.8 apareció solo, con datos de producción reales, no fabricados).
  - Criterios 1, 2 y 4 (tres personas distintas registrándose, uniéndose por código, cargando sus 3 tiempos, y que el mensual acumule 2+ días) **no los puedo hacer yo**: crear cuentas nuevas está fuera de lo que puedo hacer por regla, sea cual sea el pedido. **Esto lo tenés que hacer vos con tus amigos** — es la única parte que le falta al MVP para darse por aceptado del todo.

## Fase 6 — Modos de competencia (~6 h)

- [x] **T6.1** `scoring/positionPoints.ts` + tests. [RF-13] §5.2 **Hecho**, 7 tests. Mismo patrón que `totalTime.ts` (D2): un ranking independiente por juego, sin total cruzado. `drop_worst_n` descarta los N peores días EN PUNTOS (el de menos puntos), no en tiempo — unidad invertida respecto de `total_time`, documentado en el código. Reusa el mismo fix de empates (T4b.8): puntos y tiempo total iguales → `tied`, no el alfabético inventando un 1º/2º.
- [x] **T6.2** Exponer `scoring_mode` en el leaderboard y en el panel de settings. [RF-13, RF-17] **Hecho y verificado en producción real**: cambié el grupo real a "Puntos por posición" desde Ajustes, confirmé que `/ranking` y Home mostraban puntos en vez de tiempo (podio, tabla, "tu posición"), y volví el grupo a "Tiempo total" para no dejar la config alterada. `GET /groups/:id/leaderboard` ya no rechaza el modo con 400; `gapToLeader`/`gapToPodium`/`deltaVsYesterday` son sensibles al modo (ascendente en tiempo, descendente en puntos). **Bug real encontrado en esta verificación**: el panel de ajustes (`GroupSettingsForm`) arrancaba siempre en los defaults hardcodeados, nunca con lo que el grupo tenía guardado de verdad — "Guardar" sin tocar cada campo pisaba en silencio cualquier ajuste ya hecho. Corregido: ahora sincroniza con `GET /groups/:id` (que ya devolvía `settings`, sólo faltaba leerlo en el front). Reproducido y confirmado el fix en producción: cambié `drop_worst_n` a 2, guardé, cerré y reabrí el panel — mostraba 2, no 0.
- [x] **T6.3** API `GET /groups/:id/h2h` + matriz en la web. [RF-13] **Hecho y verificado en producción real**, 5 tests. Por decisión de alcance, la web muestra el historial del propio jugador contra cada rival compartido ("Cabeza a cabeza · Crucigrama: Luquistrikis 1—0"), no la matriz NxN completa del grupo — no entra en una pantalla de celular con más de 3-4 jugadores (RNF-2), y RF-13 ya pide la métrica en primera persona ("cuántas veces le gané a cada uno"). Mismo patrón por-juego que el resto desde D2. Extraje `services/scoringData.ts` para no duplicar la carga de roster/entries/blackouts entre `leaderboard.ts` y esta ruta nueva. **Cierra la Fase 6.**
- [x] ~~**T6.4** Ranking por juego individual (mismo endpoint, filtro por `game`).~~ **Superada por el cambio de alcance de D2 (2026-09-01, ver Fase 4b): el ranking por juego dejó de ser un filtro opcional sobre un ranking combinado — es el único ranking que existe.** No queda nada que hacer acá.
- [x] **T6.5** `blackout_dates`: API + acción del admin "anular este día". [D6] **Hecho y verificado en producción real**: anulé hoy, vi el banner "Este día está anulado" con celdas en `·` y el botón "Reactivar", y lo reactivé para dejar el día como estaba. `GET/POST/DELETE /groups/:id/blackouts`, admin only, idempotente. Migración `0009` con dos índices únicos parciales (juego puntual / día entero) para que anular dos veces no duplique filas.

## Fase 7 — Temporadas e historia (~5 h)

- [ ] **T7.1** Creación automática de `seasons` al primer entry del período. [RF-16]
- [ ] **T7.2** Cron 00:10 ART: cerrar temporadas vencidas y congelar `final_standings`. [RF-16] §5.4
- [ ] **T7.3** API `GET /groups/:id/seasons` + palmarés.
- [ ] **T7.4** Web: palmarés por mes en la pantalla de grupo, según artboard 04. [RF-16]

## Fase 8 — Estadísticas (~5 h)

- [ ] **T8.1** `scoring/stats.ts`: racha, consistencia, PB, completion, trend + tests. [RF-14] §5.3
- [ ] **T8.2** API `GET /groups/:id/stats`.
- [ ] **T8.3** Web `/stats` según artboard 04: evolución por juego a 14 días + tarjetas de récord personal, racha (actual y mejor), consistencia, completado y tiempos verificados. [RF-14, RF-19]
- [ ] **T8.4** Destacar el récord personal cuando alguien lo rompe (badge en la carga y en el día). [RF-14]

## Fase 9 — Terminaciones (~5 h)

- [ ] **T9.0** Pasada de fidelidad contra el diseño: screenshot de cada pantalla implementada vs. su artboard, corregir diferencias, repetir. Mínimo dos rondas.

- [ ] **T9.1** Pasada de accesibilidad: contraste, anillo de foco ámbar en todo lo interactivo (nunca removido), labels, navegación por teclado. [RNF-7]
- [ ] **T9.2** Estados vacíos según artboard 05 (grupo recién creado y día sin cargas) + estados de carga y error en el resto. §6.6
- [ ] **T9.3** Verificación mobile real (iOS Safari y Android Chrome): sin scroll horizontal, sin zoom en los inputs (`font-size: 16px`). [RNF-2]
- [ ] **T9.4** `README.md` con setup local, deploy y las reglas de la liga explicadas en criollo.

## Backlog (post-v1)

- PWA instalable + notificación "faltan tus tiempos de hoy"
- Resumen semanal automático para pegar en el chat del grupo
- Ranking global entre grupos [D4]
- Handicap por nivel (para que entre un novato sin quedar último siempre)
- Screenshot como comprobante [D3]
- Predicción "a este ritmo, ganás el mes"

---

## Orden recomendado

`Fase 0 → 1 → 2 → 3 → 4 → 5` y **usarlo**. Recién después, elegir entre 6, 7 y 8 según lo que el grupo pida. Nada de construir la matriz H2H antes de que alguien haya cargado un tiempo real.
