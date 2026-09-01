# Liga de Juegos

Registro y competencia de los juegos diarios de La Nación (Crucigrama, Cruci Experto, Sudoku Avanzado) entre amigos.

**Estado:** especificación completa, sin código todavía. El desarrollo arranca por `specs/03-tasks.md` → Fase 0.

## Cómo funciona la competencia

- Cada uno carga su tiempo diario en cada juego.
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

## Stack

React + Vite (Vercel) · Node + Express (Render) · Postgres + Auth (Supabase) · Bootstrap 5

## Flujo de trabajo

Spec-driven: los documentos son la fuente de verdad. Si durante la implementación se cambia una regla, **primero se actualiza la spec y después el código**.
