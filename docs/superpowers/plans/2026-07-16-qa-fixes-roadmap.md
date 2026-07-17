# QA Fixes — Roadmap de ejecución (superpowers)

**Date:** 2026-07-16
**Status:** Draft — pendiente de aprobación
**Fuente:** `docs/Incidencias_Norgtech_QA.md` (84 incidencias) + `docs/Plan_Correcciones_Norgtech.md`
**Estrategia de ramas:** una rama por **fase** (`fix/qa-p0-seguridad-dinero`, `fix/qa-p1-core`, …). Cada feature dentro de la fase se ejecuta como un bloque de tasks SDD sobre esa misma rama.

---

## 1. Cómo se ejecuta (protocolo SDD del repo)

Cada **feature** sigue el flujo ya establecido en este repo:

1. **Design spec** en `docs/superpowers/specs/2026-07-16-<slug>-design.md` (el "qué" y "por qué").
2. **Implementation plan** en `docs/superpowers/plans/2026-07-16-<slug>.md` — tasks discretas, cada una con TDD (test que falla → implementar → test que pasa → commit).
3. **Ejecución** en `.superpowers/sdd/`: `progress.md` (estado + comandos de test + branch + merge base), `task-N-brief.md`, `task-N-report.md`, y `review-<sha>..<sha>.diff` por revisión.
4. **Revisión adversarial** por lentes (seguridad, aislamiento de datos, regresión) antes de merge, como en `progress.md` actual.

Los specs de **toda la Fase P0 ya están escritos** (ver §4). Los de P1-P3 se generan feature por feature cuando arranque cada fase.

### Comandos de test del repo

```
# NestJS API (unit + e2e)
cd apps/api && npx jest
cd apps/api && npx jest --config test/jest-e2e.json

# Frontend Next.js (Playwright)
cd apps/web && npx playwright test

# Agente Nora (Python)
cd agents/nora && uv run pytest
```

---

## 2. Stack (para ubicar cada cambio)

| Capa | Ruta | Tecnología |
|------|------|-----------|
| Frontend | `apps/web` | Next.js App Router (`src/app/(app)/<módulo>`) |
| API CRM | `apps/api` | NestJS + Prisma + PostgreSQL (`src/modules/<módulo>`) |
| Agente IA | `agents/nora` | Python + LangGraph |
| Servicio comisiones | `backend/` | FastAPI (fuera del alcance de este QA) |

Auth ya existe: `apps/api/src/modules/auth` con `JwtAuthGuard`, `RolesGuard`, `@Roles()` decorator y `jwt.strategy.ts`. **La infraestructura de permisos está; falta aplicarla.**

---

## 3. Features y secuencia

14 features agrupadas en 4 fases. "Cierra" = incidencias que resuelve.

### Fase P0 — Seguridad y dinero · rama `fix/qa-p0-seguridad-dinero`

| # | Feature (slug) | Cierra | Capa | Depende de |
|---|----------------|--------|------|-----------|
| P0.1 | `rbac-hardening` | RBAC-01…14 | API + Front | — |
| P0.2 | `sesion-refresh-token` | AUTH-01, AUTH-02 | API + Front | — |
| P0.3 | `credito-exposicion-pedidos` | ORD-01, ORD-02 | API + Front | — |
| P0.4 | `pricing-descuentos-segmento` | QUO-01, QUO-02, QUO-03, ORD-04 | API + Front | — |
| P0.5 | `empresa-facturadora-prefijos` | ORD-03, ORD-05, BILL-03 | API + Front | — |
| P0.6 | `metas-vendedor-atribucion` | GOAL-02 (+ DASH-06 parcial) | API | P0.4 (usa total con descuento) |

> P0.6 depende de P0.4 porque la venta que suma a la meta debe usar el `total` ya con descuento correcto.

### Fase P1 — Core funcional · rama `fix/qa-p1-core`

| # | Feature (slug) | Cierra | Capa |
|---|----------------|--------|------|
| P1.1 | `vencimientos-visitas-seguimientos` | VIS-01, VIS-02, FUP-01…05 | API + Front |
| P1.2 | `errores-validacion-i18n` | CLI-02, PRD-01, BILL-01, BILL-02, COM-02, ORD-08, AUTH-03 | API + Front |
| P1.3 | `estados-pedido-facturacion` | ORD-07, OPP-01, QUO-04, BILL-04 | API |
| P1.4 | `contadores-dashboard-agenda` | DASH-03, DASH-04, DASH-05, DASH-06, AGEN-01, AGEN-02, GOAL-01, RET-02 | API + Front |

### Fase P2 — UX / catálogos · rama `fix/qa-p2-ux`

| # | Feature (slug) | Cierra | Capa |
|---|----------------|--------|------|
| P2.1 | `i18n-labels-catalogos` | I18N-01, I18N-02, DASH-01, DASH-02, CLI-06 | Front |
| P2.2 | `exportaciones-formato` | EXP-02, EXP-03 | API |
| P2.3 | `campos-catalogos-formularios` | CLI-01, CLI-03, CLI-04, CLI-05, ORD-06, OPP-02, OPP-03 | API + Front |
| P2.4 | `registros-inactivos-varios` | ZON-01, COM-01, ORD-09, REP-01, EXP-01 | API + Front |

### Fase P3 — IA Nora · rama `fix/qa-p3-nora`

| # | Feature (slug) | Cierra | Capa |
|---|----------------|--------|------|
| P3.1 | `nora-transiciones-estado` | AI-01, AI-02 | Nora + API |
| P3.2 | `nora-edicion-cliente` | AI-03, AI-04, AI-05 | Nora |
| P3.3 | `nora-visitas-y-flujos` | AI-07, AI-08, AI-09, AI-10 | Nora |
| P3.4 | `nora-gastos-y-resumen` | AI-06, AI-11 | Nora |

*(P3 puede correr en paralelo a P1/P2 porque toca `agents/nora`, un código separado.)*

---

## 4. Estado de los specs

| Feature | Spec | Estado |
|---------|------|--------|
| P0.1 rbac-hardening | `specs/2026-07-16-rbac-hardening-design.md` | ✅ escrito |
| P0.2 sesion-refresh-token | `specs/2026-07-16-sesion-refresh-token-design.md` | ✅ escrito |
| P0.3 credito-exposicion-pedidos | `specs/2026-07-16-credito-exposicion-pedidos-design.md` | ✅ escrito |
| P0.4 pricing-descuentos-segmento | `specs/2026-07-16-pricing-descuentos-segmento-design.md` | ✅ escrito |
| P0.5 empresa-facturadora-prefijos | `specs/2026-07-16-empresa-facturadora-prefijos-design.md` | ✅ escrito |
| P0.6 metas-vendedor-atribucion | `specs/2026-07-16-metas-vendedor-atribucion-design.md` | ✅ escrito |
| P1.* / P2.* / P3.* | — | ⏳ se generan al iniciar cada fase |

---

## 5. Decisiones abiertas que bloquean P0

Estas afectan directamente el diseño de los specs P0; conviene resolverlas antes de ejecutar:

1. ~~**RBAC-01:** ¿Director comercial gestiona Empresas/Zonas?~~ ✅ **RESUELTO (2026-07-16):** sí, `administrador` y `director_comercial` gestionan Empresas y Zonas.
2. ~~**Crédito (P0.3):** ¿desde qué estado cuenta? ¿se repone?~~ ✅ **RESUELTO (2026-07-16):** la exposición cuenta **desde orden aprobada** (`orden_facturacion`+); `recibido` no compromete cupo. La reposición es automática (exposición derivada) al cancelar/rechazar/devolver.
3. ~~**Descuento por segmento (P0.4):** ¿siempre o condicional a metas?~~ ✅ **RESUELTO (2026-07-16):** condicional — aplica solo cuando el cliente **cumple la meta** de su segmento (ventas ≥ `minGoalAmount`). Sub-decisión menor pendiente: la ventana de "ventas acumuladas" (por defecto: año en curso).
4. ~~**Metas vendedor (P0.6):** ¿fuente del vendedor?~~ ✅ **RESUELTO (2026-07-16):** campo nuevo `Order.sellerUserId`, elegible en el formulario. *(Sub-decisión menor abierta: si la meta cuenta también `orden_facturacion` o solo `facturado`+.)*

**Estado:** las 4 decisiones bloqueantes de P0 están resueltas. Quedan 2 sub-decisiones menores que no bloquean (ventana YTD del descuento; estados que cuentan a la meta), con default definido en cada spec.
