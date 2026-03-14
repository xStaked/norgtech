# STATE.md

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-03-13)

**Core value:** Dar a Norgtech y a cada productor una vista operativa clara, accionable y segura de su operación por unidad productiva.
**Current focus:** Phase 7.1 — Portal operativo del productor

## Current State

- Monorepo operativo con `frontend/` y `backend/`.
- Fases 0 a 7 del roadmap principal implementadas parcial o totalmente según el repositorio actual.
- Portal productor ahora usa un shell persistente con sidebar y rutas canónicas para `cases` y `farms`.
- Backend ya modela productores (`clients`), granjas (`farms`), visitas, casos y calculadoras.

## Execution Status

- **Current phase:** `07.1-portal-operativo-del-productor`
- **Last completed plan:** `07.1-03-PLAN.md`
- **Plan progress in phase:** 1/5 summaries creados
- **Last session:** 2026-03-14T13:15:38Z
- **Stopped at:** Completed 07.1-03-PLAN.md

## Decisions

- El portal productor adopta el shell compartido de sidebar para alinear la navegación con el workspace admin y evitar lógica de navegación duplicada en las páginas.
- Las rutas canónicas del portal productor pasan a ser `/portal/cases` y `/portal/farms`; `my-cases` y `my-farm` quedan como compatibilidad vía redirect.

## Performance Metrics

| Phase | Plan | Duration | Tasks | Files | Completed |
|-------|------|----------|-------|-------|-----------|
| 07.1-portal-operativo-del-productor | 03 | 11min | 2 | 12 | 2026-03-14 |

## Issues

- `frontend` todavía no tiene configuración ESLint; `pnpm --dir frontend lint` falla antes de analizar archivos. `pnpm --dir frontend build` sí pasó para este plan.

## Planning Notes

- Se inicializa `.planning/` sobre un proyecto brownfield ya avanzado.
- El roadmap raíz sigue siendo la fuente pública del plan; `.planning/ROADMAP.md` se usa para continuidad GSD.
- La siguiente expansión prioritaria es convertir el portal productor en experiencia operacional multi-módulo y multi-especie.

## Open Decisions

- Confirmar el nombre final de la nueva entidad hija de `farm` para porcino y avícola.
- Confirmar si ventas y reportes serán módulos de lectura en fase 7.1 o incluirán escritura completa desde el inicio.
- Definir si la analítica del productor se alimenta solo de backend existente o requiere nuevos agregados dedicados.

---
*Last updated: 2026-03-14 after executing 07.1-03*
