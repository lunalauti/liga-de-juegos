# Liga de Juegos

Registro y competencia de los juegos diarios de La Nación (Crucigrama, Cruci Experto, Sudoku Avanzado) entre amigos.

**Estado:** Fase 3 completa (carga de resultados). Se puede importar un resultado real desde el link de La Nación con preview antes de confirmar, cargar los 3 juegos a mano con DNF, y editar/borrar dentro de la ventana de 48 h. Sigue la Fase 4 (motor de puntuación y ranking — el MVP jugable) en `specs/03-tasks.md`.

## Setup

```bash
npm install
npm test          # 11 tests
npm run typecheck
npm run dev:web   # http://localhost:5173 — ver /kitchen-sink
npm run dev:api   # http://localhost:3001/health
```

Copiá `.env.example` a `.env` y completá las llaves de Supabase (Project Settings → API y → Database).

```bash
node apps/api/scripts/migrate.mjs   # aplica supabase/migrations/*.sql, idempotente
```

## Cómo funciona la competencia

- Cada uno pega el **link de "compartir" de La Nación** al terminar y el sistema importa juego, fecha, tiempo y si lo completó. También se puede cargar a mano, pero queda marcado como no verificado.
- Si no lo terminaste, se te suma la penalización: **Crucigrama 20:00 · Cruci Experto 40:00 · Sudoku Avanzado 45:00**.
- Gana la temporada (semanal o mensual) quien tenga **menor tiempo total acumulado**.
- Desempate: más victorias diarias → menos abandonos → mejor tiempo individual.
- Opcionales por grupo: puntos por posición estilo F1, descartar los N peores días, y matriz cabeza a cabeza.

## Documentos

| # | Documento | Qué contiene |
|---|---|---|
| 1 | [Requerimientos](specs/01-requirements.md) | Qué tiene que hacer el sistema, criterios de aceptación, decisiones abiertas |
| 2 | [Diseño](specs/02-design.md) | Arquitectura, modelo de datos, API, motor de puntuación, deploy |
| 3 | [Tareas](specs/03-tasks.md) | Plan de implementación en 10 fases |
| 4 | [Prompt de UI](specs/04-ui-design-prompt.md) | Prompt listo para pegar en Claude Design |

La integración con la API de La Nación está documentada en [02-design.md §9](specs/02-design.md#9-integración-con-la-nación-agilmente).

## Herramientas

```bash
node tools/ln-shared.mjs <link-de-resultado-compartido>
```

Consulta la API de La Nación y devuelve el resultado ya normalizado. Sirve para confirmar el mapeo de juegos y niveles antes de escribir el importador.

## Stack

React + Vite (Vercel) · Node + Express (Render) · Postgres + Auth (Supabase) · Bootstrap 5

## Flujo de trabajo

Spec-driven: los documentos son la fuente de verdad. Si durante la implementación se cambia una regla, **primero se actualiza la spec y después el código**.
