# Empresa Facturadora y Prefijos — Implementation Plan

**Date:** 2026-07-16
**Spec:** `/tmp/2026-07-16-empresa-facturadora-prefijos-design.md`
**Branch:** `fix/qa-p0-seguridad-dinero`
**Merge base:** TBD (`git merge-base HEAD origin/main` — completar antes de abrir el PR)
**Cierra:** ORD-03, ORD-05, BILL-03

**Tests backend:** `cd apps/api && npx jest`
**Tests frontend:** `cd apps/web && npx playwright test`

---

## Contexto verificado sobre el código real

Anclas confirmadas en `apps/api/src/modules/orders/orders.service.ts`:

- **BUG raíz ORD-03 (líneas 108-109):** el snapshot de la empresa facturadora cae al nombre del cliente cuando el DTO no lo manda.

  ```ts
  const billingCompanyNameSnapshot =
    dto.billingCompanyNameSnapshot?.trim() || customerNameSnapshot || null;
  ```
- La `company` ya se carga y valida en `create` (líneas 63-68), con `company.name` y `company.prefix` disponibles.
- La numeración con prefijo ya funciona: `nextOrderNumber(company.prefix)` en la línea 104, definido en las líneas 831-845 (`EPP-001`, `EPP-006`, …).
- `findAll` (líneas 402-407) **sí** incluye `company: true` (línea 404).
- **Hallazgo que corrige la spec:** `findOne` (líneas 409-423) **NO** incluye `company`. La spec §3.2 afirma que ambos lo incluyen; es falso. Sin `company` en `findOne`, el detalle del pedido no puede leer la relación (`order.company.name` / `order.company.prefix`). Hay que añadir `company: true`.
- `createBillingRequest` (líneas 533-575): el `create` de `BillingRequest` (líneas 548-560) incluye `customer`, `opportunity`, `sourceOrder`, pero **NO** `company`. Para BILL-03 hay que exponer `company.prefix`.

Datos del schema (`apps/api/prisma/schema.prisma`): `Order.companyId` es requerido (línea 702), `Order.billingCompanyNameSnapshot` es `String?` (línea 663), `Company.prefix` es `@unique` (línea 237), `Company.name` (línea 234). `BillingRequest.companyId` requerido con relación `company` (líneas 806-807).

Convención: prosa en español, identificadores/código en inglés. Cada task sigue TDD estricto: escribir test que falla → correr (FAIL) → implementar → correr (PASS) → commit.

---

## Task 1 — Fix backend: `billingCompanyNameSnapshot = company.name` (ORD-03)

**Files:**
- Modify: `apps/api/src/modules/orders/orders.service.ts` (líneas 108-109)
- Test: `apps/api/src/modules/orders/orders.service.spec.ts` (nuevo)

**Interfaces:**
- Cambia: dentro de `create()`, `billingCompanyNameSnapshot` deja de derivar del cliente y pasa a ser **siempre** `company.name`.
- Sin cambios de firma pública ni de DTO. `dto.billingCompanyNameSnapshot` deja de gobernar este campo.

- [ ] **Step 1: Escribir el test que falla**

Crear `apps/api/src/modules/orders/orders.service.spec.ts`. Objetivo: al crear un pedido **sin** `billingCompanyNameSnapshot` en el DTO y con un cliente cuyo `displayName` difiere de `company.name`, el snapshot persistido debe quedar con `company.name`, no con el nombre del cliente.

```ts
import { OrdersService } from "./orders.service";
import { Prisma } from "@prisma/client";

describe("OrdersService.create — billingCompanyNameSnapshot (ORD-03)", () => {
  function buildService() {
    const createdData: any = {};
    const prisma: any = {
      customer: {
        findUnique: jest.fn().mockResolvedValue({
          id: "cus_1",
          displayName: "DT comercial", // cliente
          taxId: "900123",
          address: "Calle 1",
          segment: { discountPercent: new Prisma.Decimal(0) },
        }),
      },
      company: {
        findUnique: jest.fn().mockResolvedValue({
          id: "co_1",
          name: "Empresa Prueba", // empresa facturadora
          prefix: "EPP",
          isActive: true,
        }),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ id: "u_1", name: "Ana" }) },
      order: { findFirst: jest.fn().mockResolvedValue(null) }, // nextOrderNumber -> EPP-001
      $transaction: jest.fn(async (cb: any) =>
        cb({
          order: {
            create: jest.fn(async (args: any) => {
              Object.assign(createdData, args.data);
              return { id: "ord_1", ...args.data };
            }),
          },
        }),
      ),
    };
    const credit: any = { assertCreditLimit: jest.fn().mockResolvedValue(undefined) };
    const audit: any = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new OrdersService(prisma, audit, {} as any, credit, {} as any);
    return { service, prisma, getCreatedData: () => createdData };
  }

  it("usa company.name cuando el DTO no envía billingCompanyNameSnapshot", async () => {
    const { service, getCreatedData } = buildService();
    await service.create({ id: "u_1", email: "ana@x.co" } as any, {
      customerId: "cus_1",
      companyId: "co_1",
      items: [{ quantity: 1, unitPrice: 100, taxPercent: 19 }],
    } as any);

    expect(getCreatedData().billingCompanyNameSnapshot).toBe("Empresa Prueba");
    expect(getCreatedData().billingCompanyNameSnapshot).not.toBe("DT comercial");
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd apps/api && npx jest orders.service.spec`
Expected: FAIL — el snapshot vale `"DT comercial"` (fallback al cliente) por el bug de las líneas 108-109.

- [ ] **Step 3: Implementar el fix**

En `apps/api/src/modules/orders/orders.service.ts`, reemplazar las líneas 108-109:

```ts
    const billingCompanyNameSnapshot =
      dto.billingCompanyNameSnapshot?.trim() || customerNameSnapshot || null;
```

por:

```ts
    // La empresa facturadora es SIEMPRE la company (companyId es requerido en el schema).
    // Se elimina el fallback al nombre del cliente que causaba ORD-03.
    const billingCompanyNameSnapshot = company.name;
```

`company` ya está en scope y validado (líneas 63-68). El uso posterior en `tx.order.create` (línea 212) no cambia.

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `cd apps/api && npx jest orders.service.spec`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/orders/orders.service.ts apps/api/src/modules/orders/orders.service.spec.ts
git commit -m "fix(orders): billing company snapshot always uses company.name (ORD-03)"
```

---

## Task 2 — Serialización: `findOne`/`findAll` exponen la empresa facturadora (ORD-03/ORD-05)

**Files:**
- Modify: `apps/api/src/modules/orders/orders.service.ts` (`findOne`, líneas 409-423)
- Test: `apps/api/src/modules/orders/orders.service.spec.ts` (extender)

**Interfaces:**
- `findOne(id)` pasa a incluir `company: true`, de modo que la respuesta expone `order.company.name` (empresa facturadora), `order.company.prefix` y `order.customer.displayName` (cliente) como campos distintos.
- `findAll` ya incluye `company: true` (línea 404): solo se cubre con un test de regresión (no requiere cambio de código).

- [ ] **Step 1: Escribir el test que falla**

Añadir a `orders.service.spec.ts`:

```ts
describe("OrdersService.findOne — serialización empresa facturadora", () => {
  it("incluye la relación company (name + prefix)", async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: "ord_1",
      orderNumber: "EPP-006",
      company: { id: "co_1", name: "Empresa Prueba", prefix: "EPP" },
      customer: { id: "cus_1", displayName: "DT comercial" },
    });
    const prisma: any = { order: { findUnique } };
    const service = new OrdersService(prisma, {} as any, {} as any, {} as any, {} as any);

    await service.findOne("ord_1");

    // el include debe pedir company
    const include = findUnique.mock.calls[0][0].include;
    expect(include.company).toBe(true);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd apps/api && npx jest orders.service.spec`
Expected: FAIL — hoy `findOne` (líneas 412-421) no incluye `company`, así que `include.company` es `undefined`.

- [ ] **Step 3: Implementar**

En `findOne` (líneas 409-423), añadir `company: true` al objeto `include`. Queda:

```ts
  findOne(id: string) {
    return this.prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        company: true,
        opportunity: true,
        sourceQuote: true,
        sourceConversation: true,
        items: true,
        billingRequests: true,
        assignedLogisticsUser: true,
        customerZone: { include: { zone: true, assignedTo: { select: { id: true, name: true } } } },
      },
    });
  }
```

(`findAll` en la línea 404 ya trae `company: true`; no se toca.)

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `cd apps/api && npx jest orders.service.spec`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/orders/orders.service.ts apps/api/src/modules/orders/orders.service.spec.ts
git commit -m "fix(orders): findOne includes company relation for billing company display (ORD-03)"
```

---

## Task 3 — Migración de datos idempotente (data-fix histórico)

**Files:**
- Create: `apps/api/prisma/scripts/fix-billing-company-snapshot.ts`
- Test: `apps/api/prisma/scripts/fix-billing-company-snapshot.spec.ts` (nuevo)

**Interfaces:**
- Exporta `fixBillingCompanySnapshot(prisma): Promise<{ scanned: number; corrected: number }>`.
- Regla: para cada `Order` con `company` cargada donde `billingCompanyNameSnapshot === customerNameSnapshot` **y** `billingCompanyNameSnapshot !== company.name`, reescribe `billingCompanyNameSnapshot = company.name`.
- Idempotente: una segunda corrida no vuelve a tocar los registros ya arreglados (`corrected === 0`).
- Loguea el conteo corregido (sin caps silenciosos): `console.log(...)` con `scanned`/`corrected`.

- [ ] **Step 1: Escribir el test que falla**

Crear `apps/api/prisma/scripts/fix-billing-company-snapshot.spec.ts`:

```ts
import { fixBillingCompanySnapshot } from "./fix-billing-company-snapshot";

describe("fixBillingCompanySnapshot", () => {
  function buildPrisma(orders: any[]) {
    const updates: any[] = [];
    const prisma: any = {
      order: {
        findMany: jest.fn().mockResolvedValue(orders),
        update: jest.fn(async (args: any) => {
          updates.push(args);
          return args;
        }),
      },
    };
    return { prisma, updates };
  }

  it("reescribe el snapshot cuando hoy = nombre del cliente", async () => {
    const { prisma, updates } = buildPrisma([
      {
        id: "ord_1",
        billingCompanyNameSnapshot: "DT comercial",
        customerNameSnapshot: "DT comercial",
        company: { name: "Empresa Prueba" },
      },
    ]);
    const res = await fixBillingCompanySnapshot(prisma);
    expect(res.corrected).toBe(1);
    expect(updates[0].data.billingCompanyNameSnapshot).toBe("Empresa Prueba");
  });

  it("no toca pedidos ya correctos (idempotente)", async () => {
    const { prisma, updates } = buildPrisma([
      {
        id: "ord_2",
        billingCompanyNameSnapshot: "Empresa Prueba",
        customerNameSnapshot: "DT comercial",
        company: { name: "Empresa Prueba" },
      },
    ]);
    const res = await fixBillingCompanySnapshot(prisma);
    expect(res.corrected).toBe(0);
    expect(updates).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd apps/api && npx jest fix-billing-company-snapshot`
Expected: FAIL — el módulo no existe todavía (`Cannot find module`).

- [ ] **Step 3: Implementar el script**

Crear `apps/api/prisma/scripts/fix-billing-company-snapshot.ts`:

```ts
import { PrismaClient } from "@prisma/client";

type PrismaLike = Pick<PrismaClient, "order">;

export async function fixBillingCompanySnapshot(prisma: PrismaLike) {
  const orders = await prisma.order.findMany({
    include: { company: { select: { name: true } } },
  });

  let corrected = 0;
  for (const order of orders) {
    const companyName = order.company?.name;
    if (!companyName) continue;
    // Solo corrige donde el snapshot histórico quedó con el nombre del cliente
    // y difiere del nombre real de la empresa. Idempotente por construcción.
    if (
      order.billingCompanyNameSnapshot === order.customerNameSnapshot &&
      order.billingCompanyNameSnapshot !== companyName
    ) {
      await prisma.order.update({
        where: { id: order.id },
        data: { billingCompanyNameSnapshot: companyName },
      });
      corrected += 1;
    }
  }

  const result = { scanned: orders.length, corrected };
  console.log(
    `[fix-billing-company-snapshot] scanned=${result.scanned} corrected=${result.corrected}`,
  );
  return result;
}

// Ejecución directa: `npx ts-node prisma/scripts/fix-billing-company-snapshot.ts`
if (require.main === module) {
  const prisma = new PrismaClient();
  fixBillingCompanySnapshot(prisma)
    .then(() => prisma.$disconnect())
    .catch(async (err) => {
      console.error(err);
      await prisma.$disconnect();
      process.exit(1);
    });
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `cd apps/api && npx jest fix-billing-company-snapshot`
Expected: PASS (ambos casos: corrección e idempotencia).

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/scripts/fix-billing-company-snapshot.ts apps/api/prisma/scripts/fix-billing-company-snapshot.spec.ts
git commit -m "chore(orders): idempotent data-fix for historical billing company snapshot"
```

> **Ejecución en despliegue:** correr una vez tras el merge, en horario de baja carga, con backup previo de `Order`. Ver "Riesgo de la migración" al final.

---

## Task 4 — Front detalle/listado de pedidos: empresa facturadora + nombre con prefijo (ORD-03/ORD-05)

**Files:**
- Modify: `apps/web/src/app/(app)/orders/[id]/page.tsx` (detalle — ruta según spec §4.1; confirmar nombre exacto del archivo en el árbol real)
- Modify: `apps/web/src/app/(app)/orders/page.tsx` (listado — spec §4.2)
- Test: `apps/web/tests/e2e/orders-billing-company.spec.ts` (Playwright, nuevo)

**Interfaces:**
- Detalle: el campo **"Empresa facturadora"** se pinta desde `order.company.name` (la relación, ya expuesta por Task 2), y el cliente desde `order.customer.displayName`. Son campos distintos.
- Detalle y listado: el identificador del pedido usa `order.orderNumber` (ya trae prefijo, p. ej. `EPP-006`).

- [ ] **Step 1: Escribir el test que falla**

Crear `apps/web/tests/e2e/orders-billing-company.spec.ts`. Con un pedido seed cuya empresa = "Empresa Prueba" (prefijo `EPP`) y cliente = "DT comercial":

```ts
import { test, expect } from "@playwright/test";

test("detalle de pedido muestra empresa facturadora (no el cliente) y prefijo", async ({ page }) => {
  await page.goto("/orders/ord_seed_epp");
  const billing = page.getByTestId("order-billing-company");
  await expect(billing).toHaveText("Empresa Prueba");
  await expect(billing).not.toHaveText("DT comercial");
  await expect(page.getByTestId("order-number")).toContainText("EPP-006");
});

test("listado de pedidos muestra el nombre con prefijo", async ({ page }) => {
  await page.goto("/orders");
  await expect(page.getByTestId("order-row-ord_seed_epp")).toContainText("EPP-006");
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd apps/web && npx playwright test orders-billing-company`
Expected: FAIL — el detalle hoy pinta el snapshot/cliente y faltan los `data-testid`.

- [ ] **Step 3: Implementar**

- En el detalle (`orders/[id]/page.tsx`): reemplazar la fuente del campo "Empresa facturadora" para que use `order.company?.name` (relación) en lugar de `order.billingCompanyNameSnapshot`; añadir `data-testid="order-billing-company"`. Mostrar el cliente en su propio campo con `order.customer?.displayName`. Añadir `data-testid="order-number"` al consecutivo (`order.orderNumber`).
- En el listado (`orders/page.tsx`): asegurar que la celda del nombre/consecutivo del pedido use `order.orderNumber` (con prefijo) y exponer `data-testid="order-row-<id>"` en la fila.

> Nota: los nombres/rutas exactos de estos componentes no están en el snapshot subido; confirmar contra el árbol real de `apps/web/src/app/(app)/orders` antes de editar. La fuente de datos correcta (`order.company.name`) ya está garantizada por Task 2.

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `cd apps/web && npx playwright test orders-billing-company`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/\(app\)/orders apps/web/tests/e2e/orders-billing-company.spec.ts
git commit -m "fix(web): order detail/list show billing company from company relation with prefix (ORD-03/ORD-05)"
```

---

## Task 5 — Módulo facturación: mostrar `company.prefix` en la solicitud (BILL-03)

**Files:**
- Modify: `apps/api/src/modules/orders/orders.service.ts` (`createBillingRequest`, línea 559)
- Modify: `apps/web/src/app/(app)/facturacion/page.tsx` (listado de solicitudes — spec §4.3; confirmar ruta real)
- Test API: `apps/api/src/modules/orders/orders.service.spec.ts` (extender)
- Test front: `apps/web/tests/e2e/billing-request-prefix.spec.ts` (Playwright, nuevo)

**Interfaces:**
- API: `createBillingRequest` incluye `company: true` en el `create` (hoy la línea 559 solo trae `customer`, `opportunity`, `sourceOrder`), exponiendo `billingRequest.company.prefix`.
- Front facturación: cada fila de solicitud antepone `company.prefix` al identificador de la solicitud/pedido origen.

- [ ] **Step 1: Escribir el test que falla (API)**

Añadir a `orders.service.spec.ts`:

```ts
describe("OrdersService.createBillingRequest — company.prefix (BILL-03)", () => {
  it("expone la relación company en la solicitud creada", async () => {
    const create = jest.fn(async (args: any) => ({
      id: "br_1",
      company: { prefix: "EPP" },
      ...args.data,
    }));
    const prisma: any = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: "ord_1",
          status: "entregado",
          customerId: "cus_1",
          companyId: "co_1",
          opportunityId: null,
          items: [{ id: "it_1" }],
        }),
      },
      billingRequest: { create },
      $transaction: jest.fn(async (cb: any) => cb({ billingRequest: { create } })),
    };
    const audit: any = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new OrdersService(prisma, audit, {} as any, {} as any, {} as any);

    await service.createBillingRequest({ id: "u_1", email: "a@x.co" } as any, "ord_1");

    const include = create.mock.calls[0][0].include;
    expect(include.company).toBe(true);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd apps/api && npx jest orders.service.spec`
Expected: FAIL — el `include` de la línea 559 no trae `company`.

- [ ] **Step 3: Implementar (API)**

En `createBillingRequest`, línea 559, cambiar:

```ts
        include: { customer: true, opportunity: true, sourceOrder: true },
```

por:

```ts
        include: { customer: true, company: true, opportunity: true, sourceOrder: true },
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `cd apps/api && npx jest orders.service.spec`
Expected: PASS.

- [ ] **Step 5: Escribir el test de front que falla (Playwright)**

Crear `apps/web/tests/e2e/billing-request-prefix.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("solicitud de facturación muestra el prefijo de la empresa", async ({ page }) => {
  await page.goto("/facturacion");
  await expect(page.getByTestId("billing-request-row-br_seed")).toContainText("EPP");
});
```

- [ ] **Step 6: Correr el test para verificar que falla**

Run: `cd apps/web && npx playwright test billing-request-prefix`
Expected: FAIL — la fila no muestra el prefijo / falta el `data-testid`.

- [ ] **Step 7: Implementar (front facturación)**

En el listado de solicitudes (`facturacion/page.tsx`), anteponer `request.company?.prefix` al identificador de cada fila y exponer `data-testid="billing-request-row-<id>"`.

> Nota: confirmar la ruta real del módulo de facturación en `apps/web/src/app` (no está en el snapshot). Si existe un `billing.service`/`billing.controller` que lista `BillingRequest`, asegurar que su `include` traiga `company: true` de forma equivalente al fix de la línea 559.

- [ ] **Step 8: Correr el test para verificar que pasa**

Run: `cd apps/web && npx playwright test billing-request-prefix`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/orders/orders.service.ts apps/api/src/modules/orders/orders.service.spec.ts apps/web/src/app/\(app\)/facturacion apps/web/tests/e2e/billing-request-prefix.spec.ts
git commit -m "feat(billing): expose and render company prefix on billing requests (BILL-03)"
```

---

## Task 6 — Verificación final

**Files:** ninguno (solo ejecución de suites).

- [ ] **Step 1: Suite backend completa**

Run: `cd apps/api && npx jest`
Expected: PASS. Confirma Tasks 1, 2, 3, 5 (API) y ausencia de regresiones en `orders`/`invoices`.

- [ ] **Step 2: Suite frontend completa**

Run: `cd apps/web && npx playwright test`
Expected: PASS. Confirma Tasks 4 y 5 (front).

- [ ] **Step 3: Checklist de la spec §7 (verificación manual/QA)**

  - [ ] `orders.create` guarda `billingCompanyNameSnapshot = company.name` sin DTO (ORD-03).
  - [ ] `findOne` expone empresa facturadora (`company.name`) y cliente por separado.
  - [ ] `orderNumber` incluye el prefijo de empresa (ORD-05).
  - [ ] Migración: los pedidos con snapshot = cliente quedan con `company.name`; el conteo aparece en el log.
  - [ ] Solicitud de facturación expone/pinta `company.prefix` (BILL-03).

- [ ] **Step 4: Completar el merge base y abrir el PR**

Run: `git merge-base HEAD origin/main` y actualizar el encabezado del plan. Abrir el PR contra `fix/qa-p0-seguridad-dinero`.
