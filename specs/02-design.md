# Liga de Juegos — Diseño técnico

> Fase 2 de 3. Traduce `01-requirements.md` en arquitectura, modelo de datos, API y algoritmos. Cada decisión referencia el RF que la justifica.

---

## 1. Arquitectura general

```
┌─────────────────┐        ┌──────────────────┐        ┌──────────────────┐
│  Web (React)    │  HTTPS │  API (Node/Expr) │   pg   │    Supabase      │
│  Vite + BS 5    ├───────►│  Render          ├───────►│  Postgres + Auth │
│  Vercel         │  JWT   │                  │        │  RLS             │
└────────┬────────┘        └──────────────────┘        └────────▲─────────┘
         │                                                      │
         └──────────── Supabase Auth SDK (login/refresh) ────────┘
```

**Por qué API propia y no Supabase directo desde el front:** el cálculo de rankings (RF-11 a RF-15) tiene reglas por grupo, penalizaciones, drop-worst y desempates. Eso vive mejor en un servicio con tests que en queries armadas en el cliente. Supabase queda como base de datos + proveedor de identidad; el front nunca escribe resultados directamente.

**Reparto de responsabilidades**

| Capa | Responsable de |
|---|---|
| React (Vercel) | UI, estado de formularios, sesión, cache de respuestas |
| Supabase Auth | registro, login, Google OAuth, emisión y refresh de JWT |
| API Node (Render) | validación, reglas de negocio, cálculo de rankings, autorización |
| Postgres (Supabase) | persistencia, constraints de integridad, RLS como segunda barrera |

### Flujo de autenticación

1. El front usa `@supabase/supabase-js` para login/registro. Supabase devuelve un JWT.
2. El front manda ese JWT en `Authorization: Bearer` a la API.
3. La API valida la firma contra el JWKS de Supabase (`SUPABASE_JWT_SECRET`) y extrae `sub` = `user_id`.
4. La API consulta Postgres con la **service role key** (bypassa RLS) y aplica la autorización ella misma. RLS queda activa igual, como red de seguridad si alguien alguna vez pega desde el cliente (RNF-4).

---

## 2. Stack y decisiones

| Elemento | Elección | Motivo |
|---|---|---|
| Front | React 18 + Vite + TypeScript | Vite arranca rápido y buildea a estático que Vercel sirve gratis |
| UI kit | Bootstrap 5 (via `bootstrap` + SCSS propio) | Pedido. Se usa `react-bootstrap` para componentes con accesibilidad resuelta |
| Estado servidor | TanStack Query | Cache, refetch e invalidación al cargar un tiempo; evita un Redux entero |
| Router | React Router 6 | — |
| Gráficos | Recharts | Liviano, suficiente para RF-19 |
| API | Node 20 + Express + TypeScript | Estándar, deploya en Render sin fricción |
| Validación | Zod | Un esquema por endpoint, compartido con el front vía `packages/shared` |
| DB | Postgres (Supabase) | Pedido |
| Acceso a datos | `postgres.js` + SQL a mano | Los rankings son SQL analítico; un ORM estorbaría |
| Migraciones | Supabase CLI (`supabase/migrations/*.sql`) | Versionadas en el repo |
| Tests | Vitest (+ Supertest en la API) | El motor de scoring necesita tests de verdad |
| Monorepo | npm workspaces | Sin Turborepo: son 3 paquetes |

### Estructura de carpetas

```
liga-de-juegos/
├── specs/                    # Estos documentos
├── apps/
│   ├── api/
│   │   └── src/
│   │       ├── routes/       # HTTP: parseo, códigos de estado
│   │       ├── services/     # Reglas de negocio
│   │       ├── scoring/      # Motor de puntuación (puro, testeable)
│   │       ├── db/           # Cliente pg + queries
│   │       ├── middleware/   # auth, errores, rate limit
│   │       └── index.ts
│   └── web/
│       └── src/
│           ├── pages/        # Home, Cargar, Ranking, Grupo, Perfil, Historial
│           ├── components/
│           ├── hooks/        # useSession, useGroup, useLeaderboard
│           ├── api/          # cliente HTTP tipado
│           └── styles/       # _variables.scss + custom.scss
├── packages/shared/          # Tipos + esquemas Zod + utils de tiempo
└── supabase/migrations/
```

---

## 3. Modelo de datos

Todos los `id` son `uuid` con `default gen_random_uuid()`. Todos los timestamps son `timestamptz` en UTC.

### 3.1 Tablas

**`profiles`** — extiende `auth.users` de Supabase (RF-1, RF-2)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | = `auth.users.id` |
| `display_name` | text NOT NULL | 2–30 chars |
| `avatar` | text | emoji o URL |
| `lanacion_user_ids` | text[] default '{}' | ids de La Nación asociados a este perfil (§9.4) |
| `created_at` | timestamptz | |

**`games`** — catálogo de juegos (RF-17, D5). Es data, no enum: agregar un juego nuevo no requiere deploy.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `slug` | text UNIQUE | `crucigrama`, `cruci-experto`, `sudoku-avanzado` |
| `name` | text | "Crucigrama" |
| `ln_game` | text | `crossword` / `sudoku` — para matchear lo que importa el link (§9.2) |
| `ln_level` | text | `daily` / `expert` / `hard` |
| `default_penalty_seconds` | int | 1200 / 2400 / 2700 |
| `sort_order` | int | orden de aparición en la UI |
| `active` | bool | |

**`groups`** (RF-3, RF-5)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `name` | text NOT NULL | |
| `invite_code` | text UNIQUE NOT NULL | 6 chars, alfabeto sin caracteres ambiguos (`0/O`, `1/I`) |
| `created_by` | uuid → profiles | |
| `settings` | jsonb NOT NULL | ver §3.2 |
| `archived_at` | timestamptz NULL | |

**`group_members`** (RF-4)

| Campo | Tipo | Notas |
|---|---|---|
| `group_id` | uuid → groups | PK compuesta |
| `user_id` | uuid → profiles | PK compuesta |
| `role` | text | `admin` \| `member` |
| `joined_at` | timestamptz | |

**`group_games`** — qué juegos están activos y con qué penalización en cada grupo (RF-17)

| Campo | Tipo | Notas |
|---|---|---|
| `group_id` | uuid → groups | PK compuesta |
| `game_id` | uuid → games | PK compuesta |
| `penalty_seconds` | int NOT NULL | override del default del juego |
| `enabled` | bool | |

**`entries`** — el corazón del sistema (RF-6 a RF-10)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `group_id` | uuid → groups | |
| `user_id` | uuid → profiles | |
| `game_id` | uuid → games | |
| `puzzle_date` | date NOT NULL | fecha del diario, no de carga |
| `duration_seconds` | int NOT NULL | si `dnf`, = penalización vigente al momento de cargar |
| `dnf` | bool NOT NULL default false | |
| `source` | text NOT NULL | `lanacion_link` \| `manual` |
| `verified` | bool NOT NULL default false | true sólo si vino de un link importado y el `external_user_id` coincide con el perfil |
| `external_id` | uuid NULL UNIQUE | id del resultado compartido de La Nación. UNIQUE global = un link no se puede usar dos veces |
| `external_user_id` | text NULL | id del jugador en La Nación (ej. `lanacion-1805577755`) |
| `external_payload` | jsonb NULL | respuesta cruda, por si mañana queremos más campos |
| `created_at` / `updated_at` | timestamptz | |

`UNIQUE (group_id, user_id, game_id, puzzle_date)` — un resultado por jugador/juego/día/grupo. Un upsert sobre esa clave resuelve la edición (RF-9).

> **Nota de diseño — por qué `entries` cuelga del grupo y no sólo del usuario:** la penalización y los juegos activos son configurables *por grupo* (RF-17), así que "20 minutos" puede significar cosas distintas en dos grupos. Guardar el resultado por grupo mantiene cada liga autoconsistente y hace el recálculo trivial. El costo es duplicar filas para quien esté en varios grupos; con este volumen es irrelevante, y el front carga en todos los grupos del jugador de una sola vez (§4, `POST /entries/bulk`).

**`entry_audit`** — log de ediciones visible al grupo (RF-9)

| Campo | Tipo |
|---|---|
| `id` | uuid PK |
| `entry_id` | uuid → entries |
| `actor_id` | uuid → profiles |
| `action` | text (`create` \| `update` \| `delete`) |
| `before` / `after` | jsonb |
| `created_at` | timestamptz |

**`seasons`** (RF-16)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `group_id` | uuid → groups | |
| `period_type` | text | `week` \| `month` |
| `starts_on` / `ends_on` | date | inclusive, en hora Argentina |
| `status` | text | `open` \| `closed` |
| `final_standings` | jsonb NULL | snapshot congelado al cerrar |

`UNIQUE (group_id, period_type, starts_on)`.

**`blackout_dates`** — días anulados (D6)

| `group_id` | `puzzle_date` | `game_id` NULL = todos | `reason` |

### 3.2 `groups.settings` (jsonb)

```json
{
  "period_types": ["month", "week"],
  "primary_period": "month",
  "absence_policy": "penalize",
  "scoring_mode": "total_time",
  "position_points": [5, 3, 2, 1],
  "drop_worst_n": 0,
  "edit_window_hours": 48,
  "timezone": "America/Argentina/Buenos_Aires"
}
```

Se guarda como jsonb y se valida con Zod al escribir. Motivo: la lista de settings va a crecer (D5, D6) y no quiero una migración por cada toggle. Lo que sí es relacional es todo lo que se consulta o se joinea — `group_games` es tabla, no json.

### 3.3 Índices

```sql
create index on entries (group_id, puzzle_date);
create index on entries (group_id, user_id, puzzle_date);
create index on entries (user_id, game_id, duration_seconds) where dnf = false; -- récords personales
```

### 3.4 RLS (RNF-4)

Activa en todas las tablas. La API usa service role y no depende de RLS, pero las políticas existen como segunda barrera:

- `profiles`: lectura de uno mismo y de quienes comparten grupo; escritura sólo de uno mismo.
- `groups` / `group_members` / `group_games` / `entries`: lectura si `auth.uid()` es miembro del grupo (via función `is_member(group_id)` marcada `security definer` y `stable`, para evitar recursión de políticas).
- `entries`: escritura sólo si `user_id = auth.uid()` y `puzzle_date` dentro de la ventana de edición.

---

## 4. API HTTP

Base `/api/v1`. Todo JSON. Todo autenticado salvo `/health`.

**Errores** — formato único:
```json
{ "error": { "code": "ENTRY_LOCKED", "message": "Ya pasaron 48 h. Pedile al admin que lo edite.", "details": {} } }
```
Códigos: `400` validación, `401` sin token, `403` sin permiso, `404`, `409` conflicto de estado, `422` regla de negocio, `429` rate limit.

### Endpoints

| Método | Ruta | Descripción | RF |
|---|---|---|---|
| `GET` | `/me` | Perfil + grupos del usuario | RF-2 |
| `PATCH` | `/me` | Editar nombre/avatar | RF-2 |
| `GET` | `/games` | Catálogo de juegos | — |
| `POST` | `/groups` | Crear grupo | RF-3 |
| `GET` | `/groups/:id` | Detalle: miembros, settings, juegos activos | RF-5 |
| `PATCH` | `/groups/:id` | Editar nombre/settings (admin) | RF-17 |
| `POST` | `/groups/:id/regenerate-code` | Nuevo código (admin) | RF-5 |
| `DELETE` | `/groups/:id/members/:userId` | Remover miembro (admin) | RF-5 |
| `POST` | `/groups/join` | Unirse con `{ code }` | RF-4 |
| `GET` | `/groups/:id/day?date=` | Grilla jugador × juego de un día | RF-12, RF-20 |
| `POST` | `/entries/import` | Importar desde un link de La Nación `{ group_ids, url }` | RF-6 |
| `POST` | `/entries` | Upsert manual de un resultado | RF-6b, RF-7, RF-9 |
| `POST` | `/entries/bulk` | Upsert de varios juegos y/o grupos de una | RF-6, RNF-2 |
| `DELETE` | `/entries/:id` | Borrar dentro de ventana | RF-9 |
| `GET` | `/groups/:id/entries?from=&to=&userId=` | Historial crudo | RF-19 |
| `GET` | `/groups/:id/leaderboard?period=month&date=` | Ranking calculado | RF-11, RF-13 |
| `GET` | `/groups/:id/seasons` | Temporadas + palmarés | RF-16 |
| `GET` | `/groups/:id/stats?userId=` | Racha, consistencia, PB, completion | RF-14 |
| `GET` | `/groups/:id/h2h` | Matriz cabeza a cabeza | RF-13 |

### Ejemplo — `GET /groups/:id/leaderboard`

```json
{
  "period": { "type": "month", "starts_on": "2026-08-01", "ends_on": "2026-08-31", "status": "open" },
  "scoring_mode": "total_time",
  "games": [{ "slug": "crucigrama", "name": "Crucigrama", "penalty_seconds": 1200 }],
  "rows": [{
    "user": { "id": "…", "display_name": "Lautaro", "avatar": "🦊" },
    "rank": 1,
    "total_seconds": 41520,
    "per_game": { "crucigrama": { "total": 9120, "avg": 456, "best": 388, "dnf": 1 } },
    "days_played": 20,
    "dnf_count": 2,
    "daily_wins": 7,
    "dropped_days": ["2026-08-14"],
    "trend": -32
  }]
}
```

El front no calcula nada: pinta. Si el modo es `position_points`, aparece `points` y el orden es descendente (RNF-1).

---

## 5. Motor de puntuación

Módulo puro en `apps/api/src/scoring/`: recibe entries + settings, devuelve tabla. Sin I/O, sin fechas implícitas, 100 % testeable — es la parte donde un bug se nota y donde una discusión entre amigos se decide.

### 5.1 Algoritmo (modo `total_time`)

```
entrada: entries del grupo en [desde, hasta], settings, miembros, juegos activos, blackouts
1. Expandir la grilla: para cada (miembro × juego activo × día no anulado) resolver un valor:
     - hay entry no-DNF  → duration_seconds
     - hay entry DNF     → penalty_seconds del grupo  (RF-7)
     - no hay entry      → si absence_policy = "penalize" → penalty_seconds  (RF-8)
                           si "ignore" → excluido de la suma, marcado incompleto
2. Si drop_worst_n > 0: por jugador, descartar los N días de mayor suma diaria (RF-13)
3. total_seconds = suma de los valores restantes
4. Calcular por día el ganador diario (menor suma del día, sólo días completos) → daily_wins (RF-12)
5. Ordenar ascendente por total_seconds
6. Desempatar: daily_wins ↓, dnf_count ↑, mejor tiempo individual ↑, display_name (RF-15)
```

**Nota:** el DNF se guarda con la penalización *vigente al momento de cargar*, pero el motor **recalcula** usando la penalización actual del grupo. Así, cambiar la penalización (RF-17) reordena la temporada en curso sin tocar filas.

### 5.2 Modo `position_points`

Por cada día y cada juego, ordenar ascendente y repartir `position_points` (los DNF y ausentes quedan últimos y suman 0). El total es la suma de puntos; se ordena descendente. Empate en puntos → desempata por tiempo total ascendente.

### 5.3 Métricas complementarias (RF-14)

- **Racha**: recorrer los días hacia atrás desde hoy; cortar en el primer día con un juego activo sin entry o con DNF.
- **Consistencia**: desvío estándar poblacional de los tiempos no-DNF por juego. Se muestra como `±mm:ss`.
- **PB**: `min(duration_seconds) where dnf = false`, por usuario y juego (usa el índice parcial de §3.3).
- **Completion**: `entries no-DNF / (días × juegos activos)`.
- **Trend**: promedio de esta temporada − promedio de la anterior, en segundos.

### 5.4 Estrategia de cálculo

Cálculo **on-read** con cache en memoria (TTL 60 s, clave `group:period:date`), invalidado al escribir un entry del grupo. Con 20 jugadores × 3 juegos × 31 días son ~1.900 filas: se calcula en milisegundos. Nada de tablas materializadas ni jobs — es complejidad que no se paga sola (RNF-5).

Un job nocturno (Render cron, 00:10 ART) sí hace una cosa: cerrar las temporadas vencidas y congelar `final_standings` (RF-16).

### 5.5 Manejo de fechas

Regla única: **la fecha del puzzle es un `date`, no un instante.** El servidor calcula "hoy" con `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })` y nunca confía en la fecha del cliente (RNF-3). Los límites de semana (lunes–domingo) y mes se resuelven con `date-fns-tz`.

---

## 6. Front-end

### 6.1 Pantallas

| Ruta | Pantalla | Contenido |
|---|---|---|
| `/login` | Acceso | Email+pass, Google, registro |
| `/` | Home | Card "¿Ya cargaste hoy?", tu posición, podio del día (RF-18) |
| `/cargar` | Carga diaria | Los 3 juegos en una vista, selector de fecha, toggle DNF (RF-6, RNF-2) |
| `/ranking` | Ranking | Tabs semana/mes, general + por juego, tabla ordenable (RF-11) |
| `/dia/:fecha` | Detalle de día | Grilla jugador × juego (RF-20) |
| `/stats` | Mis estadísticas | Gráfico de evolución, PB, racha, consistencia (RF-14, RF-19) |
| `/grupo` | Grupo | Miembros, código de invitación, settings (admin), palmarés |
| `/grupo/nuevo`, `/unirse` | Alta / ingreso | (RF-3, RF-4) |

### 6.2 Patrones

- **Selector de grupo** en el header; el grupo activo se guarda en `localStorage` y viaja como parte de la ruta de la query.
- **Input de tiempo**: campo único que acepta `7:45`, `745`, `1:07:45`. Normaliza a segundos en `packages/shared/time.ts` — misma función en front y back, un solo lugar donde equivocarse.
- **Optimistic update** al cargar un tiempo: la fila aparece al instante, TanStack Query invalida el leaderboard al confirmar.
- **Estados vacíos con intención**: "Todavía nadie cargó nada hoy. Sé el primero." — no un spinner vacío.
- **Bootstrap customizado por SCSS**, no por clases sueltas: se sobreescriben `$primary`, `$font-family-base`, `$border-radius` en `_variables.scss` antes de importar Bootstrap. Así no queda con cara de bootstrap default (ver `04-ui-design-prompt.md`).

---

## 7. Deploy

| Pieza | Dónde | Notas |
|---|---|---|
| Web | Vercel | Build `npm run build -w apps/web`, output `apps/web/dist`. Preview por PR |
| API | Render Web Service (free) | Docker o buildpack Node. **El plan free duerme a los 15 min**: el front muestra un skeleton en el primer request y un cron externo (cron-job.org) pega a `/health` cada 10 min |
| DB + Auth | Supabase (free) | Migraciones aplicadas por CI con Supabase CLI |
| Cron de cierre | Render Cron Job | 00:10 ART diario |

**Variables de entorno**

- API: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `ALLOWED_ORIGINS`, `PORT`
- Web: `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

**CI (GitHub Actions)**: en cada PR → typecheck + lint + tests. En merge a `main` → migraciones y deploy (Vercel y Render se enganchan al repo por su cuenta).

**Seguridad operativa**: CORS restringido a los dominios de Vercel; `helmet`; rate limit de 100 req/min por IP y 20 escrituras/min por usuario; la service role key jamás sale del backend.

---

## 8. Riesgos

| Riesgo | Mitigación |
|---|---|
| Cold start de Render free (~30 s) | Ping externo + skeletons; si molesta, upgrade a $7/mes |
| Alguien reporta un tiempo falso | Log de ediciones visible + el admin puede corregir. Es un juego entre amigos, no un banco |
| Cambio de reglas a mitad de mes | Sólo recalcula temporadas `open`; las cerradas quedan congeladas |
| Zona horaria / horario de verano | Argentina no aplica DST; igual, toda fecha pasa por el mismo helper |
| El grupo abandona a las 2 semanas | El MVP es chico a propósito: si funciona, se le agrega; si no, no se perdió un mes |


---

## 9. Integración con La Nación (Agilmente)

Los juegos de La Nación corren sobre la plataforma **Agilmente** (`lanacion.agilmenteapp.com`, API en `lanacion-api.agilmenteapp.com/api/`). Al terminar un juego, el front hace `POST games/end` y arma un link para compartir: `https://lanacion.agilmenteapp.com/shared/<uuid>`. Ese link es exactamente el que hoy se pega en el chat del grupo.

### 9.1 El único endpoint que sirve

```
GET https://lanacion-api.agilmenteapp.com/api/games/shared/<uuid>
```

Sin autenticación, `Access-Control-Allow-Origin: *`. Respuesta real:

```json
{
  "id": "d11707e8-7916-4699-913c-becac7f971a4",
  "date": "2026-08-31",
  "start": "23:00:31", "end": "23:30:54",
  "game": "crossword", "level": "expert",
  "points": 200, "seconds": 1818, "formated_time": "30:18", "best_time": "30:18",
  "result": "SUCCESS",
  "name": null, "user_id": "lanacion-1805577755",
  "ranking": 1, "customer": "lanacion",
  "html_header": "…", "html_details": "…",
  "created_at": "2026-09-01T02:00:31.000Z"
}
```

Trae todo lo que necesitamos: **fecha del puzzle** (`date`, ya en día local — no hay que resolver zona horaria), **juego y nivel**, **segundos exactos**, **si lo completó** (`result`: `SUCCESS` | `FAIL`) e **identidad del jugador** (`user_id`).

### 9.2 Mapeo de juegos

| Nuestro `slug` | `ln_game` | `ln_level` | Penalización |
|---|---|---|---|
| `crucigrama` | `crossword` | `daily` | 1200 s |
| `cruci-experto` | `crossword` | `expert` | 2400 s |
| `sudoku-avanzado` | `sudoku` | `hard` *(a confirmar con un link real; los niveles de sudoku son `easy`/`normal`/`hard`)* | 2700 s |

Los otros niveles de crossword existen (`express`, `mini`, `thematic`, `crossedwords`) y se pueden habilitar como juegos nuevos sin tocar código: es una fila más en `games` (D5).

### 9.3 Por qué no hay sincronización automática

Se probaron los caminos posibles y ninguno sirve:

| Intento | Resultado |
|---|---|
| `GET /api/games/shared` (listar) | 404 |
| `GET /api/games/user/<user_id>` | 404 |
| `GET /api/games/shared?user_id=…` | 404 |
| `GET /api/games/ranking/<game>/<level>/<period>` | 502 sin sesión — existe, pero requiere el token de La Nación |
| `GET /api/games/stats/<game>/<level>` | 502 sin sesión |
| `GET /api/games/<game>/<level>` | `{"error":"NO-USER"}` |

**Conclusión:** el uuid es un token por resultado que se crea recién cuando el jugador termina y comparte. No es enumerable ni derivable del `user_id`. La única fuente posible es el propio jugador pegando su link. (Adivinar uuids v4 por fuerza bruta no es una opción: 2^122 combinaciones, y además sería abusar de un servicio ajeno.)

El ranking oficial de La Nación sí existe (`games/ranking/...`), pero está detrás de su SSO (`ingresar.lanacion.com.ar`) y pediría las credenciales del diario de cada amigo. Descartado.

### 9.4 Flujo de importación

```
1. El jugador pega el link (o sólo el uuid) en /cargar.
2. La API extrae el uuid con /([0-9a-f-]{36})/ y llama al endpoint de La Nación
   (timeout 8 s, 1 reintento, cache de 24 h por uuid — el resultado es inmutable).
3. Valida:
   - ¿customer == "lanacion"?                      → si no, rechaza
   - ¿(game, level) mapea a un juego activo?       → si no, "ese juego no está en tu grupo"
   - ¿external_id ya existe?                       → 409 "ese link ya lo cargó Fulano"
   - ¿date dentro de la ventana de carga (7 días)? → si no, rechaza
4. Identidad:
   - Si el perfil no tiene ningún lanacion_user_id → lo asocia (primer link = binding).
   - Si coincide con uno asociado                  → verified = true.
   - Si no coincide                                → guarda con verified = false y avisa.
5. Escribe el entry con source = "lanacion_link",
   duration_seconds = seconds,
   dnf = (result == "FAIL")  → y en el scoring pesa la penalización del grupo, no `seconds`.
6. Invalida el cache del leaderboard de los grupos afectados.
```

Un mismo link se puede importar a **todos los grupos del jugador de una sola vez** (`group_ids`), porque la restricción de unicidad de `external_id` es global: se resuelve guardando el entry en cada grupo y el uuid en una tabla aparte.

> **Ajuste al modelo:** `entries.external_id UNIQUE` impide cargar el mismo link en dos grupos. Se reemplaza por una tabla `imported_results (external_id uuid PK, user_id, payload jsonb, imported_at)`, y `entries.external_id` pasa a ser FK no única. La unicidad real que importa es "un link, un jugador", no "un link, una fila".

### 9.5 Lo que esto cambia en el producto

- **Los tiempos pasan a ser verificables.** Se acabó la discusión sobre si alguien redondeó para abajo. El chip "verificado" en la tabla hace el trabajo social solo.
- **La carga es un pegar, no un tipear.** El link ya lo tienen en el portapapeles cuando terminan de jugar.
- **La fecha del puzzle viene del origen**, así que no hay que confiar en el reloj del celular ni pelear con la zona horaria en el caso importado.
- El grupo puede exigir link para que el resultado cuente (`settings.require_verified`, D7).

### 9.6 Riesgos de depender de un servicio ajeno

| Riesgo | Mitigación |
|---|---|
| Cambian la ruta o el formato del JSON | Un solo módulo (`services/lanacion.ts`) con parser Zod; si falla, error claro y fallback a carga manual. Un test de contrato contra un uuid real avisa cuando cambie |
| Bloquean el acceso por User-Agent u origen | Se llama desde el backend con headers de browser; si bloquean, el front puede llamar directo (el endpoint tiene CORS `*`) |
| Borran resultados viejos | Se guarda `external_payload` completo al importar: si el link muere, el dato ya es nuestro |
| Uso abusivo | Una llamada por link importado, cacheada 24 h. Rate limit propio de 30 importaciones/hora por usuario. Es un volumen despreciable para ellos |
| Alguien pega el link de otro | El binding de `lanacion_user_id` lo detecta desde el segundo link, y la unicidad global impide duplicarlo |
