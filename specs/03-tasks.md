# Liga de Juegos — Plan de tareas

> Fase 3 de 3. Cada task es un commit/PR chico, verificable por separado. `[RF-x]` = requerimiento que cubre, `§y` = sección del diseño.
> Estimación total: **~46–56 h** de trabajo efectivo. El camino más corto a algo usable es la Fase 4 (MVP jugable).

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
- [x] **T3.8** Tests de integración del endpoint de entries manual. **Hecho, pero no como suite automatizada**: se verificó contra Supabase real (mismo método que Fases 1–2) en vez de mockear `pg`, porque mockear consultas SQL secuenciales es frágil y no encuentra bugs reales — y de hecho esta ronda encontró tres (fecha con TZ del servidor, cascada de auditoría, FK de `actor_id`). Lo que sí quedó como test automatizado son las piezas puras: `argDate` (14 tests), `resolveLnVerification` (4), `extractLnId` (4).

## Fase 3.5 — Integración con La Nación (~6 h)

- [x] **T3.9** `services/lanacion.ts`: extraer uuid de una URL o texto pegado, `GET games/shared/<id>`, parsear con Zod, timeout 8 s + 1 reintento, cache 24 h. [RF-6] §9.1 **Hecho.**
- [x] **T3.10** Migración: columnas `source`, `verified`, `external_id`, `external_user_id`, `external_payload` en `entries`; tabla `imported_results`; `profiles.lanacion_user_ids`; `games.ln_game` / `games.ln_level`. §9.4 **Ya estaba en `0001_init.sql`** (se adelantó al diseñar el esquema inicial).
- [x] **T3.11** Seed del mapeo juego↔nivel. **Hecho, pero sigue sin confirmar `sudoku/hard`** — no conseguí un link real de Sudoku Avanzado para probarlo (sólo tuve acceso a un link de Cruci Experto). Sigue siendo un supuesto. §9.2
- [x] **T3.12** API `POST /entries/import` + `POST /entries/import/preview` (de sólo lectura, agregada durante la implementación — el diseño original no separaba preview de confirmación, y sin esa separación "Descartar" en la UI no deshacía nada). Validaciones de §9.4, `result: FAIL` → DNF, escritura en varios grupos a la vez. [RF-6, RF-7] **Hecho y verificado con un link real de La Nación**, incluido el flujo completo pegar → preview sin escribir → confirmar → escribe.
- [x] **T3.13** Binding de identidad: primer link asocia el `lanacion_user_id`; los siguientes marcan `verified` true/false. [RF-6] §9.4 **Hecho.** El primer caso (bind + verificado) se probó con un link real; el caso de identidad no coincidente se probó como función pura (`resolveLnVerification`, 4 tests) — no tuve un segundo link real de otra cuenta para probarlo de punta a punta.
- [x] **T3.14** Web `/cargar` según artboard 02: campo de link arriba de todo, preview de lo detectado con sello verificado, confirmar/descartar, y el estado de error de link repetido ("Ese link ya lo cargó X. Buen intento."). [RF-6] §6.5 **Hecho y verificado en el navegador con un link real, incluido el rechazo por link repetido.** Pendiente: el truncado del link por el medio (hoy el input simplemente hace overflow con ellipsis vía CSS, no trunca activamente el string).
- [x] **T3.15** Chip de verificado reutilizado en `/cargar`. [RF-6] §6.3 El resto de las pantallas donde debe repetirse (Hoy, Ranking, Detalle) llega con la Fase 4, cuando esas pantallas existan.
- [x] **T3.16** Setting `require_verified` del grupo. [D7] **Hecho**: ya estaba en el schema (T2.3); se agregó el toggle en el panel de ajustes del grupo. Sin efecto todavía en el cálculo del ranking porque el motor de puntuación es Fase 4.
- [x] **T3.17** Test de contrato contra un uuid real. §9.6 **Hecho** (`lanacion.test.ts`, gateado por `RUN_LN_CONTRACT_TEST=1` para no pegarle a la red en cada `npm test`), corrido y verificado contra la red real. **Falta cablearlo a un cron de CI diario** — no hay CI configurado todavía (eso es la Fase 5).

## Fase 4 — Scoring y ranking · **MVP jugable** (~10 h)

- [ ] **T4.1** `scoring/grid.ts`: expandir la grilla miembro × juego × día resolviendo DNF, ausencias y blackouts. [RF-8] §5.1
- [ ] **T4.2** `scoring/totalTime.ts`: suma, ganadores diarios, orden y desempates. [RF-11, RF-12, RF-15]
- [ ] **T4.3** `scoring/dropWorst.ts`: descartar los N peores días. [RF-13]
- [ ] **T4.4** **Suite de tests del motor** — casos: todos completos; un DNF; una ausencia con cada policy; empate resuelto por cada criterio; drop-worst; día anulado; grupo con 1 solo jugador; mes sin datos. *No avanzar sin esto en verde.* §5
- [ ] **T4.5** API `GET /groups/:id/leaderboard` con `period` y `date`, + cache de 60 s invalidada al escribir. [RF-11] §5.4
- [ ] **T4.6** API `GET /groups/:id/day` — grilla del día. [RF-12, RF-20]
- [ ] **T4.7** Web `/ranking` según artboard 03: tabs semana/mes, podio de tres, tabla con desglose C/E/S, mi fila con borde verde, chips por fila. 8 filas sin scroll en 390px. [RF-11]
- [ ] **T4.7b** Layout desktop del ranking (1280) con nav superior, columna de delta, panel "Tu mes", ganadores del día y "faltan cargar". §6.1
- [ ] **T4.8** Web `/` según artboard 01, con sus dos estados (sin cargar / ya cargó los tres): card de estado, posición del mes en display con delta vs. ayer y distancia al podio, podio de hoy. [RF-18]
- [ ] **T4.9** Web `/dia/:fecha` según artboard 04: grilla jugador × juego, navegación ← →, contador "6 de 8 cargaron", mejor de cada columna resaltado, símbolos distintos para DNF y para no cargó. [RF-20]
- [ ] **T4.10** Campos derivados que pide el diseño en `/leaderboard` y `/day`: deltas, distancia al podio, ganadores del día, pendientes de cargar, contador de cargados. §6.4

> **Hito: acá el sistema ya sirve.** Se puede usar con los amigos aunque falte todo lo de abajo.

## Fase 5 — Deploy (~4 h)

- [ ] **T5.1** Deploy de la API en Render + variables de entorno + `/health`. §7
- [ ] **T5.2** Deploy de la web en Vercel + variables + dominio. §7
- [ ] **T5.3** CORS y redirect URLs de Supabase Auth apuntando a los dominios reales.
- [ ] **T5.4** GitHub Actions: typecheck + lint + test en PR; migraciones en merge a `main`.
- [ ] **T5.5** Ping externo cada 10 min contra `/health` para el cold start. §7
- [ ] **T5.6** **Prueba de aceptación del MVP** con los criterios de `01-requirements.md` §7, hecha desde el celular.

## Fase 6 — Modos de competencia (~6 h)

- [ ] **T6.1** `scoring/positionPoints.ts` + tests. [RF-13] §5.2
- [ ] **T6.2** Exponer `scoring_mode` en el leaderboard y en el panel de settings. [RF-13, RF-17]
- [ ] **T6.3** API `GET /groups/:id/h2h` + matriz en la web. [RF-13]
- [ ] **T6.4** Ranking por juego individual (mismo endpoint, filtro por `game`). [D2]
- [ ] **T6.5** `blackout_dates`: API + acción del admin "anular este día". [D6]

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
