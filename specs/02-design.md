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
3. La API valida la firma contra el **JWKS público de Supabase** (`GET {SUPABASE_URL}/auth/v1/.well-known/jwks.json`, cacheado por `jose`) y extrae `sub` = `user_id`. Este proyecto usa las *signing keys* asimétricas (ES256) — no hay secreto compartido que guardar; `SUPABASE_JWT_SECRET` sólo aplica a proyectos con el esquema HS256 legacy.
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
| `created_by` | uuid → profiles, NULL, `on delete set null` | Quién lo creó, para historial — no una referencia viva (D9) |
| `settings` | jsonb NOT NULL | ver §3.2 |
| `archived_at` | timestamptz NULL | |

**`group_members`** (RF-4)

| Campo | Tipo | Notas |
|---|---|---|
| `group_id` | uuid → groups | PK compuesta |
| `user_id` | uuid → profiles | PK compuesta |
| `role` | text | `admin` \| `member` |
| `joined_at` | timestamptz | |

> **Sucesión de admin (D9):** `handle_admin_departure()`, trigger `before delete on profiles`
> (`supabase/migrations/0004_creator_departure.sql`). Si el perfil que se borra es admin de
> algún grupo y no queda otro admin ahí, el rol pasa al miembro con `joined_at` más antiguo;
> si no queda nadie más, el grupo se borra entero (cascada ya cubre `entries`, `group_games`,
> `seasons`, `blackout_dates`). Aplica a cualquier admin, no sólo al creador original.
> Verificado contra Supabase real en ambos casos (con sucesor y sin nadie más).

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
| `DELETE` | `/groups/:id` | Borrar el grupo, con confirmación por nombre en el body (admin) | RF-5 |
| `POST` | `/groups/:id/regenerate-code` | Nuevo código (admin) | RF-5 |
| `DELETE` | `/groups/:id/members/:userId` | Remover miembro (admin) | RF-5 |
| `POST` | `/groups/join` | Unirse con `{ code }` | RF-4 |
| `GET` | `/groups/:id/day?date=` | Grilla jugador × juego de un día | RF-12, RF-20 |
| `GET` | `/groups/:id/blackouts` | Días anulados vigentes (admin) | D6 |
| `POST` | `/groups/:id/blackouts` | Anular un día o un juego puntual `{ puzzleDate, gameSlug }` (admin) | D6 |
| `DELETE` | `/groups/:id/blackouts/:blackoutId` | Reactivar un día anulado (admin) | D6 |
| `POST` | `/entries/import/preview` | Sólo lectura: qué se detectó y qué pasaría, sin guardar nada. Agregado en Fase 3.5 — sin esto, "Descartar" en la UI no tenía nada que deshacer | RF-6 |
| `POST` | `/entries/import` | Confirma e importa de verdad desde un link de La Nación `{ group_ids, url }` | RF-6 |
| `POST` | `/entries` | Upsert manual de un resultado | RF-6b, RF-7, RF-9 |
| `POST` | `/entries/bulk` | Upsert de varios juegos y/o grupos de una | RF-6, RNF-2 |
| `DELETE` | `/entries/:id` | Borrar dentro de ventana | RF-9 |
| `GET` | `/groups/:id/entries?from=&to=&userId=` | Historial crudo | RF-19 |
| `GET` | `/groups/:id/leaderboard?period=month&date=` | Ranking calculado | RF-11, RF-13 |
| `GET` | `/groups/:id/seasons` | Temporadas + palmarés | RF-16 |
| `GET` | `/groups/:id/stats?userId=` | Racha, consistencia, PB, completion | RF-14 |
| `GET` | `/groups/:id/h2h` | Matriz cabeza a cabeza | RF-13 |

### Ejemplo — `GET /groups/:id/leaderboard`

**Cambio de alcance (D2, 2026-09-01): la respuesta ya no es una tabla combinada con `total_seconds` sumado entre juegos — es un ranking independiente por juego.** El shape de abajo reemplaza al `rows` plano que existía hasta la Fase 4.

```json
{
  "period": { "type": "month", "starts_on": "2026-08-01", "ends_on": "2026-08-31", "status": "open" },
  "scoring_mode": "total_time",
  "games": [{ "slug": "crucigrama", "name": "Crucigrama", "penalty_seconds": 1200 }],
  "rankings": [
    {
      "game_slug": "crucigrama",
      "game_name": "Crucigrama",
      "rows": [{
        "user": { "id": "…", "display_name": "Lautaro", "avatar": "🦊" },
        "rank": 1,
        "tied": false,
        "total_seconds": 9120,
        "avg_seconds": 456,
        "best_seconds": 388,
        "days_played": 20,
        "dnf_count": 2,
        "daily_wins": 7,
        "dropped_days": ["2026-08-14"],
        "verified_count": 18,
        "verified_total": 20,
        "trend": -32,
        "delta_vs_yesterday": 1,
        "gap_to_leader": 0,
        "gap_to_podium": 0
      }]
    }
  ],
  "todays_game_winners": [{ "game_slug": "crucigrama", "game_name": "Crucigrama", "user_id": "…", "display_name": "Lautaro", "seconds": 388 }],
  "pending_today": [{ "user_id": "…", "display_name": "Gastón" }]
}
```

El front no calcula nada: pinta. `rankings` trae un elemento por cada juego activo del grupo, en el orden del catálogo (`games.sort_order`); cada uno es una tabla completa e independiente, con su propio `rank`, sus propios líderes y su propio podio. Si el modo es `position_points`, cada elemento de `rankings[].rows` trae `points` en vez de (o adjunto a) `total_seconds`, y el orden dentro de ese juego es descendente (RNF-1). `todays_game_winners` no cambia — ya era por juego desde la Fase 4 (T4.10).

---

## 5. Motor de puntuación

Módulo puro en `apps/api/src/scoring/`: recibe entries + settings, devuelve tabla. Sin I/O, sin fechas implícitas, 100 % testeable — es la parte donde un bug se nota y donde una discusión entre amigos se decide.

> **Cambio de alcance (D2, 2026-09-01):** hasta acá el motor calculaba **una** tabla por grupo/temporada, sumando el tiempo de los 3 juegos por jugador. Se elimina esa suma: el motor ahora calcula **una tabla independiente por juego activo**, sin ningún total cruzado entre juegos. Lo que sigue reemplaza a `scoreTotalTime` tal como quedó en la Fase 4 (T4.2, T4.5); las tareas de rework están en `03-tasks.md`.

### 5.1 Algoritmo (modo `total_time`, por juego)

`buildGrid` (T4.1) no cambia: sigue armando una celda por (miembro × juego activo × día no anulado), con la misma resolución de valor. Lo que cambia es cómo se agrupa esa grilla para rankear.

```
entrada: entries del grupo en [desde, hasta], settings, miembros, juegos activos, blackouts, hoy
1. Expandir la grilla (buildGrid, sin cambios):
     - hay entry no-DNF  → duration_seconds
     - hay entry DNF     → penalty_seconds del grupo  (RF-7)
     - no hay entry      → si el día YA TERMINÓ (día < hoy) y absence_policy = "penalize" → penalty_seconds  (RF-8)
                           si no (día = hoy, todavía en curso) → excluido, sin importar absence_policy
                           si absence_policy = "ignore" → excluido de la suma, marcado incompleto
2. Para CADA JUEGO ACTIVO por separado:
   a. Filtrar la grilla a las celdas de ese juego.
   b. Si drop_worst_n > 0: por jugador, descartar los N días de mayor valor EN ESE JUEGO (RF-13) —
      ya no se suman los 3 juegos de un día para decidir qué se descarta; cada juego decide sus
      propios peores días de forma independiente. Un desastre en Sudoku no arrastra a Crucigrama.
   c. total_seconds (de ese juego) = suma de los valores restantes de ese jugador en ese juego.
   d. Calcular por día el ganador diario DE ESE JUEGO (menor valor ese día, ese juego — ya no hace
      falta "día completo": al no sumar entre juegos, no hay nada más que comparar) → daily_wins (RF-12)
   e. Ordenar ascendente por total_seconds dentro de ese juego.
   f. Desempatar dentro de ese juego: daily_wins ↓, dnf_count ↑, mejor tiempo individual ↑,
      display_name (RF-15) — todos los criterios ya estaban scopeados a un jugador; ahora también
      quedan scopeados a un juego.
   g. Asignar `rank` con ranking de competición estándar (1, 1, 3 — no 1, 2, 3, ver nota abajo):
      dos filas cuyo total_seconds, daily_wins, dnf_count Y mejor tiempo individual coinciden
      EXACTAMENTE comparten la misma posición y quedan marcadas `tied: true` (RF-15).
3. La respuesta trae un ranking por cada juego activo (§4), sin combinarlos.
```

**Nota sobre empates reales (RF-15, pedido explícito del usuario, 2026-09-01):** el orden alfabético (paso f, último criterio) decide en qué ORDEN se listan dos filas — nunca decide el `rank`. Si tras (1)-(3) dos jugadores siguen empatados, el motor los marca `tied: true` y ambos reciben el mismo `rank`; el próximo jugador con un total distinto salta al puesto que corresponde (si dos empatan por el 1º, el siguiente es 3º, no 2º — no hay "segundo puesto" cuando el primero lo ocupan dos personas). Antes de este fix, el alfabético fingía una diferencia inexistente: dos tiempos idénticos se mostraban como 1º y 2º sin ninguna indicación de que en realidad estaban empatados.

**Nota:** el DNF se guarda con la penalización *vigente al momento de cargar*, pero el motor **recalcula** usando la penalización actual del grupo. Así, cambiar la penalización (RF-17) reordena la temporada en curso sin tocar filas. Esto no cambia con D2.

**Nota sobre "hoy" (RF-8):** el día en curso nunca genera una celda de ausencia, sea cual sea `absence_policy`. `buildGrid` recibe `today` explícito y compara `day < today`. Esto tampoco cambia con D2 — sigue viviendo en `buildGrid`, que es compartido por todos los juegos.

**Simplificación real que trae este cambio:** `computeDailyWinners` (T4.2) tenía que chequear `cells.length < activeGameCount` para descartar a quien no tuviera el día completo en los 3 juegos, porque comparaba sumas del día entero. Al rankear por juego, esa comparación desaparece: ganar el día en Crucigrama sólo depende de haber jugado Crucigrama ese día, no de haber jugado también Sudoku. Menos código, no más.

### 5.2 Modo `position_points`

Ya era por juego y por día (RF-13) — no cambia con D2, sólo se aclara que el total de la temporada es la suma de puntos **dentro de ese juego**. Por cada día y cada juego, ordenar ascendente y repartir `position_points` (los DNF y ausentes quedan últimos y suman 0). Dentro de cada juego, se ordena descendente por puntos; empate en puntos → desempata por tiempo total ascendente **de ese juego**.

### 5.2b Modo `h2h` (cabeza a cabeza, RF-13)

Por juego, por día: si ambos jugadores tienen una celda ese día (jugaron, DNF o ausencia penalizada — misma grilla que §5.1), el de menos segundos suma una victoria contra el otro. Empate exacto no le suma a ninguno. Se acumula sobre todos los días del período.

**Nota de implementación:** hace falta llevar un contador de "días compartidos" separado de las victorias — `wins = 0` no alcanza para decidir si dos jugadores nunca coincidieron un día (no debería aparecer nada en la UI) o si coincidieron y siempre empataron (debería aparecer un 0-0). Encontrado por un test propio antes de shippear.

La web muestra el historial del propio jugador contra cada rival compartido, no la matriz NxN completa del grupo — con más de 3-4 jugadores una matriz no entra en una pantalla de celular (RNF-2), y RF-13 ya pide la métrica en primera persona ("cuántas veces le gané a cada uno").

### 5.3 Métricas complementarias (RF-14)

Estas métricas quedan fuera del cambio de D2 — no son "ranking", son estadísticas personales/complementarias.

- **Racha**: recorrer los días hacia atrás desde hoy; cortar en el primer día con un juego activo sin entry o con DNF. **Se mantiene holística** (todos los juegos activos), no por juego — decisión explícita, ver D11 en `01-requirements.md`.
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

El diseño está resuelto y aprobado en Claude Design (`design/Liga de Juegos.dc.html`): 11 artboards mobile de 390×844, una vista desktop del ranking a 1280 y una sección de sistema. **El canvas manda**; esta sección es su traducción a rutas, componentes y datos. Los tokens están en [`design/tokens.md`](../design/tokens.md) y listos para pegar en [`design/tokens.scss`](../design/tokens.scss).

### 6.1 Navegación

Barra inferior fija de 5 destinos, presente en todas las pantallas de primer nivel:

| Tab | Ruta | Artboard |
|---|---|---|
| Hoy | `/` | 01 (dos estados: sin cargar / ya cargó los tres) |
| Cargar | `/cargar` | 02 (link pegado, error de link repetido, a mano desplegado) |
| Tabla | `/ranking` | 03 (mobile semana/mes + desktop 1280) |
| Yo | `/stats` | 04 |
| Grupo | `/grupo` | 04 |

Fuera de la barra: `/dia/:fecha` (detalle del día, artboard 04), `/login`, `/grupo/nuevo`, `/unirse`.

Sólo el ranking tiene layout propio de desktop (nav superior + tabla ancha con columna de delta). El resto se centra a ancho mobile: es una app que se usa parado en la cocina.

### 6.2 Pantallas y contenido

| Pantalla | Qué muestra |
|---|---|
| **Hoy** | Card de estado del día (CTA "Cargar mis tiempos" o los tres tiempos con su sello), **tu posición del mes en cada juego activo** (D2 — ya no un único número sumado, sino un chip de posición por juego, ej. "1º en Crucigrama · 3º en Sudoku") con delta vs. ayer y distancia al podio de ese juego, y el podio de hoy **por juego** |
| **Cargar** | Campo de link arriba de todo → preview de lo detectado (juego, fecha, tiempo, sello verificado) → confirmar/descartar. Debajo, plegado, "Cargar a mano" con los tres juegos, toggle DNF por juego y total del día |
| **Ranking** | **Selector de juego** (tabs Crucigrama / Cruci Experto / Sudoku Avanzado, D2) + tabs Semana/Mes dentro de cada juego, podio de tres de ese juego, tabla con posición, jugador y tiempo (ya no hay columna de "total" combinado — cada tabla es de un solo juego). Mi fila con borde verde. Chips por fila: verificado, DNF, racha, victorias |
| **Detalle del día** | Grilla jugador × juego con navegación ← →, contador "6 de 8 cargaron", mejor de cada columna resaltado, y símbolos distintos para DNF y para no cargó |
| **Mis estadísticas** | Evolución por juego en 14 días, récord personal, racha actual (y la mejor), consistencia, % completado y tiempos verificados |
| **Grupo** | Código de invitación grande con copiar y compartir por WhatsApp, miembros, palmarés por mes |
| **Vacíos** | Grupo recién creado (sólo vos adentro, con las reglas explicadas) y día sin cargas |

### 6.3 Componentes con variantes

Del artboard 06, son los que se repiten y hay que construir una sola vez:

- **Fila de ranking** — 4 variantes: líder, normal, mi fila, sin cargar hoy.
- **Card de juego en la carga** — 3 estados: vacío (`--:--`), con foco, DNF (muestra el castigo).
- **Chips** — verificado (✓), a mano, N DNF, racha, victorias. El sello ✓ es la **única** marca de verificado y aparece igual en Hoy, Ranking y Detalle. Lo cargado a mano no lleva alerta: lleva contorno punteado neutro.
- **Badge de posición**, **botones** (primario, hover, foco, secundario, deshabilitado).

### 6.4 Datos que el diseño pide y la API todavía no daba

Detectado al traducir los artboards. Se agregan a los endpoints de §4:

| Endpoint | Campos nuevos | De dónde sale |
|---|---|---|
| `/leaderboard` | `delta_vs_yesterday`, `gap_to_leader`, `gap_to_podium` | "4º ▲2 · a 6:09 del podio" |
| `/leaderboard` | `daily_winners` (ganador por juego del día) | "Ganadores del día" en desktop |
| `/leaderboard` | `pending_today` (quiénes no cargaron) | "Faltan cargar: Gastón, Lu" |
| `/day` | `loaded_count` / `member_count`, `best_per_game` | "6 DE 8 CARGARON" + mejor de la columna |
| `/stats` | `verified_count` / `total_count`, `best_streak` | "72 de 84" y "Tu mejor: 19" |
| `/me` (home) | quiénes ya cargaron hoy | "Sofi, Nacho y Belén ya cargaron los tres" |

Ninguno agrega consultas nuevas: todos se derivan de la grilla que el motor de puntuación ya arma (§5.1). **Con D2 (2026-09-01), los campos de `/leaderboard` de la tabla de arriba viven dentro de cada elemento de `rankings[].rows[]` (uno por juego), no sueltos en un `rows` combinado — ver el ejemplo actualizado en §4.**

### 6.5 Diferencias resueltas contra las specs previas

1. **Código de invitación**: el diseño lo muestra como `CRUCI-84`, no como 6 caracteres al azar. **Gana el diseño** — se dicta por teléfono mucho mejor. Formato: palabra corta del nombre del grupo + guion + 2 dígitos, con reintento ante colisión. Actualiza RF-3.
2. **Largo del link de La Nación**: el mockup usa `lanacion.com.ar/juegos/r/8Xk2…`, pero el link real es `lanacion.agilmenteapp.com/shared/<uuid-de-36>`, bastante más largo. El campo tiene que **truncar por el medio** conservando el final, no cortar al final como en el mockup.
3. **Bootstrap redondea por defecto**: el diseño es `border-radius: 0` en todo. Hay que forzarlo en las variables (ya está en `tokens.scss`), no parchearlo por componente.

### 6.6 Patrones

- **Selector de grupo** en el header; el grupo activo se guarda en `localStorage`.
- **Input de tiempo**: campo único que acepta `7:45`, `745`, `1:07:45`. Normaliza a segundos en `packages/shared/time.ts` — misma función en front y back.
- **Optimistic update** al cargar un tiempo: la fila aparece al instante con la animación `rowIn` (la única del sistema), y TanStack Query invalida el leaderboard al confirmar.
- **Estados vacíos con intención**, ya diseñados: nada de spinners pelados.

## 7. Deploy

| Pieza | Dónde | Notas |
|---|---|---|
| Web | Vercel | **Deployado**: `https://liga-de-juegos.vercel.app`. `vercel.json` en la raíz define build/output para el monorepo. Preview por PR (automático de Vercel). Mismo problema que la API: Vercel instala con `NODE_ENV=production`, así que `vite`, `@vitejs/plugin-react`, `sass` y `bootstrap` viven en `dependencies` de `apps/web`, no `devDependencies`. Ese fix no alcanzó — el build seguía fallando (`sh: vite: command not found`, exit 127) hasta encontrar la causa real: el proyecto en el dashboard de Vercel tenía **Root Directory = `apps/api`** y **Framework Preset = Express** (quedó configurado como si fuera el deploy de la API), así que build/install corrían parados en `apps/api`, sin `vite` ni el resto del monorepo. Corregido en Project Settings → Build and Deployment. |
| API | Render Web Service (free) | **Deployado**: `https://liga-de-juegos-api.onrender.com`, `/health` responde `{"ok":true}`. `render.yaml` (Blueprint). Corre `tsx` directo, sin paso de build — por eso `tsx` vive en `dependencies`, no `devDependencies`: Render instala con `NODE_ENV=production`, que saltea devDependencies. **El plan free duerme a los 15 min de inactividad**: mitigado con un ping externo cada 10 min contra `/health` desde cron-job.org (T5.5) |
| DB + Auth | Supabase (free) | Migraciones aplicadas por `apps/api/scripts/migrate.mjs`, corrido por CI en cada push a `main` (job `migrate` en `.github/workflows/ci.yml`) |
| Cron de cierre de temporadas | — | **No implementado.** RF-16 (cerrar temporada y congelar `final_standings`) es Fase 7; hoy no existe ningún job programado |

**Variables de entorno**

- API (Render, secretos cargados a mano en el dashboard — `render.yaml` los marca `sync: false`): `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ALLOWED_ORIGINS`, `PORT`. (`SUPABASE_JWT_SECRET` ya no hace falta — la validación es contra JWKS, ver §1.)
- Web (Vercel, se hornean en el build — hay que cargarlas ahí, no alcanza con `.env` local): `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

**CI (GitHub Actions, `.github/workflows/ci.yml`)**: en cada PR y push a `main` → typecheck + lint + test (job `check`). Push a `main` además corre el test de contrato con La Nación (§9.6, no bloqueante) y, si `check` pasa, aplica las migraciones pendientes contra Supabase (job `migrate`, necesita el secreto `DATABASE_URL` cargado en GitHub → Settings → Secrets). El deploy en sí lo disparan Vercel y Render por su cuenta al detectar el push, conectando cada uno directamente al repo — no hay un paso de CI que los dispare.

**Seguridad operativa**: CORS restringido a los dominios de Vercel (`ALLOWED_ORIGINS`); `helmet`; rate limit **pendiente** (ver §9.6, no implementado todavía); la service role key jamás sale del backend.

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
| Uso abusivo | Una llamada por link importado, cacheada 24 h. Falta el rate limit por usuario (era parte del plan original; no está implementado todavía — lo trae la Fase 5 junto con el resto del rate limiting de la API, ver §7) |
| Alguien pega el link de otro | El binding de `lanacion_user_id` lo detecta desde el segundo link, y la unicidad global impide duplicarlo |

### 9.7 Correcciones de esquema que salieron de probar contra Supabase real

Ninguna cambia el modelo de §3; son ajustes a las reglas `on delete` que el testing de la Fase 3 encontró rotas — el patrón en los tres casos es el mismo que D9: una referencia que existe para trazabilidad histórica no puede bloquear el borrado de la fila que señala.

| Migración | Qué corrige |
|---|---|
| `0006_audit_survives_delete.sql` | `entry_audit.entry_id` tenía `on delete cascade` hacia `entries` — borrar un resultado se llevaba puesto su propio log de auditoría, justo lo que RF-9 pide conservar. Pasa a `on delete set null`. |
| `0007_audit_actor_nullable.sql` | `entry_audit.actor_id` no tenía ninguna cláusula (default RESTRICT) — bloqueaba borrar cualquier cuenta que alguna vez hubiera cargado o editado un resultado. Pasa a `on delete set null`. |
| `0005_imported_results_nullable_user.sql` | Mismo problema en `imported_results.user_id`. La query de "¿quién ya cargó este link?" pasó a `left join` para que el link siga reclamado aunque esa cuenta ya no exista. |

También: `apps/api/src/db.ts` fuerza el parser de `date` de `pg` a devolver el string tal cual llega de Postgres. Por default, `pg` construye un `Date` de JS con la zona horaria **del proceso**, no UTC — en una máquina en Argentina da la fecha correcta de casualidad, y se corre un día en un servidor con `TZ=UTC` (Render). `puzzle_date` es una fecha pura, nunca un instante (§5.5); ahora lo es de verdad, no sólo en el papel.

### 9.8 Notas de implementación de la Fase 4 (motor de puntuación)

> **Superado por D2 (2026-09-01):** todo lo de esta sección describe la Fase 4 tal como se implementó originalmente, con un ranking combinado que sumaba los 3 juegos. Ese modelo se reemplaza por el ranking por juego de §5. Se deja el texto original abajo como registro histórico de lo que se construyó y por qué — las tareas de rework están en `03-tasks.md`.

- **`position_points` todavía no está implementado** (es Fase 6). `GET /groups/:id/leaderboard` lo detecta y responde `400 SCORING_MODE_NOT_READY` en vez de calcular mal en silencio — un grupo puede elegir ese modo en los ajustes (T2.7/T3.16) sin que el ranking se rompa, simplemente no anda hasta la Fase 6.
- **El cache de 60 s (§5.4) se invalida en más lugares de los que el diseño original mencionaba**: no sólo al escribir un `entry`, también al `PATCH /groups/:id` — cambiar `drop_worst_n`, `absence_policy` o los juegos activos afecta el cálculo tanto como cargar un resultado.
- **`initialsOf`** (avatar de dos letras: "Sofi" → "SF", "Nacho Pérez" → "NP") vive en `packages/shared/src/text.ts`, compartida entre Ranking, Detalle del día, Grupo y Home — nombres de una sola palabra necesitan sus propias dos primeras letras, no la inicial de dos palabras que no existen.
- **T4.7b (layout desktop del ranking) se simplificó**: en vez de un componente aparte con nav superior propia, es CSS responsive sobre la misma pantalla — el mismo contenido se reacomoda en pantallas anchas, sin replicar la barra de navegación superior del artboard desktop.
