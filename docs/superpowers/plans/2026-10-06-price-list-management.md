# Price List Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Administrar las listas generales y permitir que comerciales carguen, envíen, corrijan y reenvíen sus listas especiales desde la interfaz.

**Architecture:** Se conserva `PriceList` y `PriceListItem` para listas generales y se añade un modelo versionado independiente para solicitudes especiales, con entradas por cliente + presentación. Las solicitudes guardan su propietario desde la sesión; la versión previamente aprobada sigue activa mientras una revisión nueva está pendiente.

**Tech Stack:** NestJS 11, Prisma 6/PostgreSQL, Next.js 16, Jest/Supertest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-06-gestion-listas-precios-design.md`

## Global Constraints

- El comercial solo carga listas especiales propias; no administra listas generales ni aprueba solicitudes.
- Administrador, dirección comercial y promotor tienen CRUD completo y pueden aprobar/rechazar listas especiales.
- La moneda especial viene del cliente (COP/USD); el comercial no la puede cambiar.
- Una lista especial admite varios clientes y presentaciones, con un precio diferente por combinación cliente + presentación.
- Rechazar una revisión permite corregirla y reenviarla; no desactiva la versión aprobada anterior.
- Las listas generales se desactivan, no se borran físicamente.
- No importar Excel ni hacer asignaciones masivas de listas generales.

## Review Focus

- **Suplantación del propietario:** el body no puede elegir `ownerUserId`; prueba API: `commercial cannot create a special list owned by another user`.
- **Cliente con moneda USD:** la API ignora/rechaza una moneda enviada por el comercial y responde con la moneda de Customer; prueba en Task 2.
- **Edición de solicitud ajena:** un comercial no puede editar ni reenviar una solicitud ajena; prueba API en Task 2.
- **Rechazo durante una revisión:** corregir/rechazar no reemplaza ni apaga la revisión aprobada activa; pruebas de flujo en Task 2.
- **Presentaciones diferentes del mismo producto:** cada entrada conserva su `presentationId` y no colisiona; prueba de clave compuesta en Task 1.

---

### Task 1: Modelos de lista especial y revisiones

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (modelos `SpecialPriceList`, `SpecialPriceListRevision`, `SpecialPriceListCustomer` y `SpecialPriceListItem`)
- Create: `apps/api/prisma/migrations/<generated_timestamp>_special_price_lists/migration.sql`
- Create: `apps/api/src/modules/price-lists/dto/create-special-price-list.dto.ts`, `create-special-price-list-item.dto.ts`
- Create: `apps/api/src/modules/price-lists/special-price-lists.controller.ts`, `special-price-lists.service.ts`
- Modify: `apps/api/src/modules/price-lists/price-lists.module.ts`
- Test: `apps/api/test/price-lists-special.e2e-spec.ts`

**Interfaces:**
- Consumes: `User`, `Customer.currency`, `ProductPresentation`, `AuditLog` y `PriceListStatus` existentes.
- Produces: `SpecialPriceList` con `ownerUserId` inmutable; `SpecialPriceListRevision` con estado, actor revisor y bandera de versión activa; ítems únicos por `(revisionId, customerId, presentationId)` y moneda derivada de Customer. `POST /special-price-lists` crea lista + primera revisión `en_revision` desde el usuario autenticado.

- [ ] **Step 1: Escribir la prueba API fallida** `creates special-list entries per customer and presentation`, con dos clientes COP/USD, mismo producto y precios distintos; assert de presentación, valor individual y moneda derivada del cliente.
- [ ] **Step 2: Ejecutar la prueba para confirmar que falla**

Run: `pnpm --filter @norgtech/api exec jest --config ./test/jest-e2e.json --runInBand test/price-lists-special.e2e-spec.ts`
Expected: FAIL porque el recurso/modelo aún no existe.

- [ ] **Step 3: Agregar los modelos y relaciones Prisma.** Una lista lógica tiene propietario; sus revisiones contienen clientes y filas por cliente/presentación. Una sola revisión puede estar activa; la restricción única incluye cliente y presentación.
- [ ] **Step 4: Crear la migración SQL, validarla desde Prisma y regenerar Prisma Client**

Run: `DATABASE_URL=postgresql://prisma:prisma@127.0.0.1:5432/prisma pnpm --filter @norgtech/api exec prisma validate --schema prisma/schema.prisma` and `DATABASE_URL=postgresql://prisma:prisma@127.0.0.1:5432/prisma pnpm --filter @norgtech/api exec prisma generate --schema prisma/schema.prisma`. Compare the new model DDL to `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`; do not connect to a database.
Expected: PASS.

- [ ] **Step 5: Implementar el mínimo vertical slice de creación** en `POST /special-price-lists`: validar clientes y presentaciones, fijar el propietario desde `@CurrentUser`, derivar moneda al responder, crear la lista/revisión/ítems y auditarlo en una transacción.
- [ ] **Step 6: Ejecutar de nuevo la prueba dirigida y commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/src/modules/price-lists/price-lists.module.ts apps/api/src/modules/price-lists/special-price-lists.controller.ts apps/api/src/modules/price-lists/special-price-lists.service.ts apps/api/src/modules/price-lists/dto/create-special-price-list.dto.ts apps/api/src/modules/price-lists/dto/create-special-price-list-item.dto.ts apps/api/test/price-lists-special.e2e-spec.ts
git add apps/api/prisma/migrations/*_special_price_lists/migration.sql
git add docs/superpowers/plans/2026-10-06-price-list-management.md docs/superpowers/plans/2026-10-06-special-pricing-traceability.md
git commit -m "feat(api): submit customer-specific special prices"
```

### Task 2: API CRUD general y ciclo de aprobación especial

**Files:**
- Modify: `apps/api/src/modules/price-lists/price-lists.controller.ts`, `price-lists.service.ts`
- Create: `apps/api/src/modules/price-lists/dto/create-price-list.dto.ts`, `update-price-list.dto.ts`, `clone-price-list.dto.ts`
- Create: `apps/api/src/modules/price-lists/dto/create-special-price-list.dto.ts`, `update-special-price-list-revision.dto.ts`
- Modify: `apps/api/test/price-lists-special.e2e-spec.ts`
- Create: `apps/api/test/price-lists-management.e2e-spec.ts`

**Interfaces:**
- Consumes: modelos de Task 1; `AuditService`; `AuthUser`.
- Produces: `POST/PATCH /price-lists`, `POST /price-lists/:id/clone`, `PUT /price-lists/:id/items` existente; endpoints `POST/GET /special-price-lists`, `GET/PATCH /special-price-lists/:id`, `POST /special-price-lists/:id/revisions`, `POST /special-price-lists/:id/revisions/:revisionId/submit` y `PATCH .../:revisionId/approval`.

- [ ] **Step 1: Escribir pruebas fallidas** `admin can create clone edit and deactivate a general list`, `commercial can submit and read only owned special lists`, `commercial can correct and resubmit a rejected revision`, `only admin director and promotor can review`, y `deactivation never deletes list items`. Assert HTTP status, owner, estado, auditoría y que la revisión previa activa queda intacta.
- [ ] **Step 2: Ejecutar los dos specs para confirmar los fallos**

Run: `pnpm --filter @norgtech/api exec jest --config ./test/jest-e2e.json --runInBand test/price-lists-management.e2e-spec.ts test/price-lists-special.e2e-spec.ts`
Expected: FAIL en rutas/permisos aún no implementados.

- [ ] **Step 3: Implementar DTOs, validación y servicios.** La lista general nueva o clonada inicia inactiva; activar una lista general la deja disponible para pricing. Clonar copia metadata/ítems, requiere nombre único y no copia clientes asignados. Desactivar conserva datos.
- [ ] **Step 4: Implementar ciclo especial transaccional.** El servidor fija propietario al crear; moneda se resuelve desde cada Customer; el comercial solo modifica borradores/rechazadas propias. La aprobación activa la nueva revisión en la misma transacción que su auditoría y reemplaza las entradas activas previas de cada combinación propietario + cliente + presentación; una revisión rechazada no cambia los precios activos.
- [ ] **Step 5: Correr ambos specs y commit**

```bash
git add apps/api/src/modules/price-lists apps/api/test/price-lists-management.e2e-spec.ts apps/api/test/price-lists-special.e2e-spec.ts
git commit -m "feat(api): manage general and special price lists"
```

### Task 3: UI de administración y carga manual

**Files:**
- Modify: `apps/web/src/app/(app)/price-lists/page.tsx`, `apps/web/src/app/(app)/price-lists/[id]/page.tsx`
- Create: `apps/web/src/app/(app)/price-lists/new/page.tsx`, `apps/web/src/app/(app)/price-lists/[id]/edit/page.tsx`, `apps/web/src/app/(app)/price-lists/special/new/page.tsx`
- Create: `apps/web/src/components/price-lists/price-list-form.tsx`, `special-price-list-form.tsx`, `price-list-actions.tsx`, `special-price-list-review-actions.tsx`
- Test: `apps/web/tests/e2e/price-lists-management.spec.ts`

**Interfaces:**
- Consumes: APIs de Task 2; selects existentes para clientes, productos y presentaciones.
- Produces: CRUD general y captura/revisión especial integrados bajo `/price-lists`.

- [ ] **Step 1: Escribir E2E fallidos** para admin crea/clona/desactiva una lista general; comercial añade dos clientes con distinto precio para el mismo producto/presentación y envía; moneda viene bloqueada por cliente; usuario autorizado corrige una rechazada y reenvía.
- [ ] **Step 2: Ejecutar el spec con API/Web disponibles y confirmar los fallos**

Run: `pnpm --filter @norgtech/web exec playwright test tests/e2e/price-lists-management.spec.ts`
Expected: FAIL por acciones y formularios inexistentes.

- [ ] **Step 3: Implementar acciones de lista general** en índice/detalle y formularios con errores de API visibles; no ofrecer eliminación física.
- [ ] **Step 4: Implementar formulario/revisión especial** con una fila por cliente + presentación + precios existentes; mostrar moneda del cliente sin control editable; separar enviar, aprobar y rechazar por rol/estado.
- [ ] **Step 5: Ejecutar E2E y build web; commit**

Run: `pnpm --filter @norgtech/web exec playwright test tests/e2e/price-lists-management.spec.ts` y `pnpm --filter @norgtech/web build`
Expected: PASS.

```bash
git add apps/web/src/app/'(app)'/price-lists apps/web/src/components/price-lists apps/web/tests/e2e/price-lists-management.spec.ts
git commit -m "feat(web): manage general and special price lists"
```
