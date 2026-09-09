# Liga de Juegos

App mobile-first para que un grupo de amigos compita con los juegos diarios de La Nación (Crucigrama, Cruci Experto, Sudoku Avanzado): cada uno pega el link de su resultado, se carga solo, y la tabla se arma sin planillas de Excel ni discusiones sobre quién redondeó el tiempo para abajo.

**En producción:**

| Pieza | URL |
|---|---|
| Web | https://liga-de-juegos.vercel.app |
| API | https://liga-de-juegos-api.onrender.com (`/health` para chequear que está viva) |
| Repo | https://github.com/lunalauti/liga-de-juegos |

CI (typecheck + lint + test, 100+ tests) corre en cada push a `main`, y si pasa aplica las migraciones pendientes contra Supabase. El deploy en sí lo disparan Vercel y Render solos al detectar el push.

## Cómo funciona la competencia

- Cada uno pega el **link de "compartir" de La Nación** al terminar un juego y el sistema importa juego, fecha, tiempo y si lo completó — queda marcado **Verificado**, porque ese link resuelve contra el servidor de La Nación y nadie más lo puede reclamar. También se puede cargar a mano, pero queda marcado como no verificado.
- Si no lo terminaste (DNF), se te suma una penalización configurable por juego (por defecto: Crucigrama 20 min · Cruci Experto 40 min · Sudoku Avanzado 45 min).
- **El ranking es independiente por juego** — no hay una tabla combinada que sume Crucigrama con Sudoku. Un mal día en uno no te hunde en el otro.
- Cada grupo elige, en Ajustes:
  - **Qué juegos están activos** (podés competir en uno solo, dos o los tres).
  - **Modo de puntuación**: tiempo total acumulado, o puntos por posición estilo F1.
  - **Período**: semanal, mensual, o ambos.
  - **Descartar los N peores días** de cada juego al cerrar la temporada.
  - Cómo tratar las ausencias (penalizar o ignorar).
- Desempate dentro de un juego: más victorias diarias → menos abandonos → mejor tiempo individual → alfabético (y si siguen empatados después de eso, se muestra como empate real, no se inventa un 1º y un 2º).
- **Cabeza a cabeza**: cuántas veces le ganaste a cada rival, por juego.
- Al cerrar una temporada queda congelada en el historial — el grupo tiene un **palmarés** con cuántos títulos ganó cada uno, por juego. El cierre lo dispara un cron externo (ver abajo).
- Estadísticas personales: racha (días seguidos completando todo, sin cortarla el día en curso), consistencia, récord personal (global, no por grupo), % de completado, tiempos verificados, y evolución a 14 días en un gráfico.

## Setup local

```bash
npm install
npm test          # 100+ tests
npm run typecheck
npm run lint
npm run dev:web   # http://localhost:5173 — ver /kitchen-sink para el sistema de componentes
npm run dev:api   # http://localhost:3001/health
```

Copiá `.env.example` a `.env` en la raíz y completá las llaves de Supabase (Project Settings → API y → Database) — trae las variables de la API y de la web juntas.

```bash
node apps/api/scripts/migrate.mjs   # aplica supabase/migrations/*.sql, idempotente
```

## Deploy

Ya está todo conectado y andando, pero si hay que rearmarlo desde cero (otro Supabase, otra cuenta):

1. **Supabase** — crear el proyecto, correr `node apps/api/scripts/migrate.mjs` contra su `DATABASE_URL`.
2. **Render** — [render.com](https://render.com) → New → Blueprint → conectar el repo (usa `render.yaml`). Cargar a mano los secretos que quedan marcados `sync: false`: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ALLOWED_ORIGINS`, `CRON_SECRET`.
3. **Vercel** — Import Project → mismo repo (usa `vercel.json`). Cargar `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (se hornean en el build, no alcanza con `.env` local).
4. **GitHub Actions** — Settings → Secrets → agregar `DATABASE_URL` para que el job de migraciones corra en cada push a `main`.
5. **Cron externo de cierre de temporadas** (RF-16): el plan free de Render no tiene Cron Jobs nativos, así que el cierre lo dispara un ping de afuera. En [cron-job.org](https://cron-job.org):
   - URL: `POST https://liga-de-juegos-api.onrender.com/internal/cron/close-seasons`
   - Header: `x-cron-secret: <el mismo valor que CRON_SECRET en Render>`
   - Frecuencia: una vez por día alcanza (el cierre depende de la fecha, no de la hora exacta).
6. **Keep-alive del free tier**: el plan free de Render duerme a los 15 min de inactividad — un segundo cron job pegándole a `GET /health` cada 10 min lo mantiene despierto. `<LoadingState />` en el front también absorbe visualmente el cold start cuando igual llega a dormirse.

## Stack

React + Vite (Vercel) · Node + Express (Render) · Postgres + Auth (Supabase) · Bootstrap 5 + SCSS propio

## Documentos

| # | Documento | Qué contiene |
|---|---|---|
| 1 | [Requerimientos](specs/01-requirements.md) | Qué tiene que hacer el sistema, criterios de aceptación, decisiones abiertas (D1-D11) |
| 2 | [Diseño](specs/02-design.md) | Arquitectura, modelo de datos, API, motor de puntuación, deploy, riesgos |
| 3 | [Tareas](specs/03-tasks.md) | Plan de implementación por fases, con qué se encontró y corrigió en cada una |
| 4 | [Prompt de UI](specs/04-ui-design-prompt.md) | Prompt usado para el diseño en Claude Design |

La integración con la API de La Nación está documentada en [02-design.md §9](specs/02-design.md#9-integración-con-la-nación-agilmente) — incluye un hallazgo real (2026-09-09): el `user_id` que devuelve cada link **no es estable por persona**, así que la verificación nunca dependió de él, depende de la unicidad del link en sí.

## Herramientas

```bash
node tools/ln-shared.mjs <link-de-resultado-compartido>
```

Consulta la API de La Nación y devuelve el resultado ya normalizado. Sirve para probar el mapeo de juegos y niveles sin pasar por la app.

## Flujo de trabajo

Spec-driven: los documentos en `specs/` son la fuente de verdad. Si algo cambia durante la implementación (un bug real, un requerimiento que resultó distinto en la práctica), **primero se actualiza la spec y después el código** — cada fase en `03-tasks.md` tiene notas de qué se encontró probando contra datos reales, no sólo la lista de lo que se construyó.
