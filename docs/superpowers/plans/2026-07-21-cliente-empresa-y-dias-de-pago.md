# Vínculo cliente–empresa y visibilidad de días de pago — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada cliente pertenece a una empresa (Norgtech o Nanonutrición), esa empresa restringe con cuál se factura, y los días de pago se ven en la lista de clientes.

**Architecture:** Se agrega `Customer.companyId` obligatorio con una migración en tres pasos que crea Nanonutrición, puebla la columna desde el campo `notes` (que ya registra la hoja de origen del import) y recién entonces la marca `NOT NULL`. `OrdersService.create` rechaza órdenes cuya empresa no coincide con la del cliente. En la web, la columna `Crédito` de la lista —hoy vacía— pasa a mostrar la condición de pago.

**Nota:** la base de desarrollo se pasa por la variable `DEV_DATABASE_URL` (exportarla en la shell). Nunca escribir credenciales en archivos versionados.

**Tech Stack:** NestJS 11, Prisma 6, PostgreSQL 18, Next.js (App Router), Jest + supertest para e2e.

## Global Constraints

- Spec de referencia: `docs/superpowers/specs/2026-07-21-cliente-empresa-y-dias-de-pago-design.md`
- `Customer.companyId` es `String` **no nullable**. Nunca opcional.
- Nanonutrición: id `clx_default_nanonutricion`, name `Nanonutrición`, legalName `Nanonutrición S.A.S.`, nit `902040575-6`, prefix `NN`.
- Norgtech ya existe con id `clx_default_norgtech`.
- Las empresas de prueba a borrar tienen prefix `EP`, `INAC`, `EPP`.
- Los e2e de este repo **stubbean `PrismaService`**; no tocan base real. Seguir ese patrón, no introducir testcontainers.
- Comandos desde `apps/api` salvo que se indique otra cosa.
- Correr un e2e puntual: `npx jest --watchman=false --config ./test/jest-e2e.json <archivo> -t "<nombre>"`

---

### Task 1: Schema, migración y empresa Nanonutrición

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (model `Customer` ~línea 491, model `Company` ~línea 232)
- Create: `apps/api/prisma/migrations/20260721000000_customer_company/migration.sql`

**Interfaces:**
- Consumes: nada.
- Produces: `Customer.companyId: string` y la relación `Customer.company: Company`. La constante de id `clx_default_nanonutricion` la usan las tareas 5 y 6.

**Nota sobre el backfill:** el spec proponía que `SET NOT NULL` fallara si alguna fila quedaba sin empresa. Eso rompería cualquier base con datos de seed (la local tiene 36 clientes de ejemplo sin `notes` de import). Por eso el backfill asigna Nanonutrición por `notes` y **todo lo demás a Norgtech**, que es la empresa por defecto del sistema. En la base remota el resultado es idéntico: 506 Norgtech / 12 Nanonutrición.

- [ ] **Step 1: Agregar la relación en el schema**

En `apps/api/prisma/schema.prisma`, dentro de `model Customer`, después de `segmentId String`:

```prisma
  companyId             String
```

Y en el bloque de relaciones del mismo modelo, después de `segment CustomerSegment @relation(...)`:

```prisma
  company               Company                @relation(fields: [companyId], references: [id])
```

En `model Company`, después de `orders Order[]`:

```prisma
  customers       Customer[]
```

- [ ] **Step 2: Crear la migración a mano**

Crear el directorio y el archivo `apps/api/prisma/migrations/20260721000000_customer_company/migration.sql`:

```sql
-- 1. Nanonutricion tiene que existir antes de poder referenciarla en el backfill.
INSERT INTO "Company" (id, name, "legalName", nit, prefix, "isActive", "createdAt", "updatedAt")
VALUES (
  'clx_default_nanonutricion',
  'Nanonutrición',
  'Nanonutrición S.A.S.',
  '902040575-6',
  'NN',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (prefix) DO NOTHING;

-- 2. Columna nullable para no romper las filas existentes.
ALTER TABLE "Customer" ADD COLUMN "companyId" TEXT;

-- 3. Backfill: el import dejo la hoja de origen en notes.
UPDATE "Customer"
SET "companyId" = 'clx_default_nanonutricion'
WHERE notes LIKE '%hoja Nanonutrición%';

-- Todo lo demas (incluido lo que no vino del import) va a la empresa por defecto.
UPDATE "Customer"
SET "companyId" = 'clx_default_norgtech'
WHERE "companyId" IS NULL;

-- 4. Recien ahora se puede exigir.
ALTER TABLE "Customer" ALTER COLUMN "companyId" SET NOT NULL;

ALTER TABLE "Customer"
  ADD CONSTRAINT "Customer_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"(id)
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Customer_companyId_idx" ON "Customer"("companyId");

-- 5. Empresas de prueba: ya no quedan ordenes ni facturas apuntando a ellas.
DELETE FROM "Company" WHERE prefix IN ('EP', 'INAC', 'EPP');
```

- [ ] **Step 3: Aplicar la migración contra la base de desarrollo**

```bash
cd apps/api
DATABASE_URL="$DEV_DATABASE_URL" npx prisma migrate deploy
```

Esperado: `1 migration found` seguido de `Applying migration '20260721000000_customer_company'` y `All migrations have been successfully applied.`

- [ ] **Step 4: Verificar el reparto y que no quedaron empresas de prueba**

```bash
psql "$DEV_DATABASE_URL" \
  -c 'select co.name, count(*) from "Customer" c join "Company" co on co.id=c."companyId" group by 1 order by 2 desc;' \
  -c 'select name, nit, prefix from "Company" order by name;'
```

Esperado exactamente:

```
   name      | count
-------------+-------
 Norgtech    |   506
 Nanonutrición |  12

     name      |     nit     | prefix
---------------+-------------+--------
 Nanonutrición | 902040575-6 | NN
 Norgtech      | 900000000-0 | NT
```

Si `Nanonutrición` sale con 0 clientes, el `LIKE` no está casando la tilde: revisar que el `notes` del import diga literalmente `hoja Nanonutrición`.

- [ ] **Step 5: Aplicar la migración también a la base local**

12 specs e2e corren contra Postgres real (`app.e2e-spec.ts`, `credit-concurrency.e2e-spec.ts`,
`permissions.e2e-spec.ts`, etc.), así que la base local tiene que tener la columna o toda esa
mitad de la suite falla.

```bash
cd apps/api && npx prisma migrate deploy
```

Esperado: `All migrations have been successfully applied.` La base local tiene clientes de seed
sin `notes` de import; el fallback los manda a Norgtech, que es lo correcto.

- [ ] **Step 6: Regenerar el cliente de Prisma**

```bash
cd apps/api && npx prisma generate
```

Esperado: `Generated Prisma Client`.

- [ ] **Step 7: Arreglar los dos sitios que crean clientes sin empresa**

`companyId` pasa a ser requerido, así que estos dos dejan de compilar/correr:

En `apps/api/prisma/seed.ts`, en el `data` del `customer.upsert` (línea ~170), agregar:

```typescript
      companyId: "clx_default_norgtech",
```

En `apps/api/test/credit-concurrency.e2e-spec.ts`, en el `data` del `prisma.customer.create`
(línea ~60), agregar la misma línea. Este spec escribe en Postgres real, así que sin esto tira
error de constraint, no de tipos.

- [ ] **Step 8: Verificar que compila y que la suite real sigue verde**

```bash
cd apps/api && npx tsc --noEmit -p tsconfig.json
npx jest --watchman=false --config ./test/jest-e2e.json credit-concurrency
```

Esperado: tsc sin errores nuevos; `credit-concurrency` en verde.

- [ ] **Step 9: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260721000000_customer_company apps/api/prisma/seed.ts apps/api/test/credit-concurrency.e2e-spec.ts
git commit -m "feat(clientes): Customer.companyId obligatorio + empresa Nanonutricion"
```

---

### Task 2: `companyId` en la API de clientes

**Files:**
- Modify: `apps/api/src/modules/customers/dto/create-customer.dto.ts`
- Modify: `apps/api/src/modules/customers/dto/update-customer.dto.ts`
- Modify: `apps/api/src/modules/customers/customers.service.ts` (`create` ~línea 29, `assertValidReferences` ~línea 101, `findAll` ~línea 195)
- Test: `apps/api/test/customers.e2e-spec.ts`

**Interfaces:**
- Consumes: `Customer.companyId` de la Task 1.
- Produces: `CreateCustomerDto.companyId: string` (requerido), `UpdateCustomerDto.companyId?: string`. `findAll` devuelve `company: { id: string; name: string }` en cada fila — lo consume la Task 6.

- [ ] **Step 1: Escribir el test que falla**

En `apps/api/test/customers.e2e-spec.ts`, agregar dentro del `describe` principal:

```typescript
  it("rechaza crear un cliente sin empresa", async () => {
    const response = await request(app.getHttpServer())
      .post("/customers")
      .set("Authorization", `Bearer ${global.__ADMIN_TOKEN__}`)
      .send({
        legalName: "Cliente Sin Empresa SAS",
        displayName: "Cliente Sin Empresa",
        segmentId: "segment-bronce",
        contacts: [{ fullName: "Contacto", isPrimary: true }],
      });

    expect(response.status).toBe(400);
  });

  it("expone la empresa en el listado", async () => {
    const response = await request(app.getHttpServer())
      .get("/customers")
      .set("Authorization", `Bearer ${global.__ADMIN_TOKEN__}`);

    expect(response.status).toBe(200);
    expect(response.body[0].company).toEqual({
      id: "clx_default_norgtech",
      name: "Norgtech",
    });
  });
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
cd apps/api && npx jest --watchman=false --config ./test/jest-e2e.json customers -t "empresa"
```

Esperado: FAIL. El primero devuelve 201 en vez de 400; el segundo, `company` undefined.

- [ ] **Step 3: Agregar `companyId` a los DTOs**

En `apps/api/src/modules/customers/dto/create-customer.dto.ts`, junto a los demás campos requeridos (después de `segmentId`):

```typescript
  @IsString()
  @IsNotEmpty()
  companyId!: string;
```

Verificar que `IsNotEmpty` esté en el import de `class-validator`; si no, agregarlo.

En `apps/api/src/modules/customers/dto/update-customer.dto.ts`, junto a los opcionales:

```typescript
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  companyId?: string;
```

- [ ] **Step 4: Validar la referencia y persistirla**

En `apps/api/src/modules/customers/customers.service.ts`, dentro de `assertValidReferences`, después del bloque que valida el segmento:

```typescript
    const company = await this.prisma.company.findUnique({
      where: { id: dto.companyId },
    });

    if (!company || !company.isActive) {
      throw new NotFoundException("Company not found or inactive");
    }
```

En el `data` de `tx.customer.create`, después de `segmentId: dto.segmentId,`:

```typescript
            companyId: dto.companyId,
```

En `findAll`, dentro de `select`, después de `segment: { select: { id: true, name: true } },`:

```typescript
        company: { select: { id: true, name: true } },
```

En `findOne`, dentro de `include`, después de `segment: true,`:

```typescript
        company: true,
```

- [ ] **Step 5: Correr el test y verificar que pasa**

```bash
cd apps/api && npx jest --watchman=false --config ./test/jest-e2e.json customers
```

Esperado: PASS, toda la suite de customers en verde.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/customers apps/api/test/customers.e2e-spec.ts
git commit -m "feat(clientes): companyId requerido al crear cliente y expuesto en las lecturas"
```

---

### Task 3: La empresa del cliente restringe la facturación

**Files:**
- Modify: `apps/api/src/modules/orders/orders.service.ts` (`create`, línea 64-71)
- Test: `apps/api/test/orders.e2e-spec.ts`

**Interfaces:**
- Consumes: `Customer.companyId` de la Task 1.
- Produces: `400 "Order company does not match customer company"` cuando no coinciden.

- [ ] **Step 1: Escribir el test que falla**

En `apps/api/test/orders.e2e-spec.ts`, primero agregar `companyId` al stub de cliente (línea ~204, dentro del objeto que devuelve `customer.findUnique` para `customer-1`):

```typescript
            companyId: "company-1",
```

Luego agregar el test:

```typescript
  it("rechaza una orden cuya empresa no es la del cliente", async () => {
    const response = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${global.__ADMIN_TOKEN__}`)
      .send({
        customerId: "customer-1",
        companyId: "company-2",
        items: [{ productId: "product-1", quantity: 1 }],
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain("customer company");
  });
```

Verificar que el arreglo `companies` del stub tenga una `company-2` activa; si no, agregarla junto a `company-1`:

```typescript
      { id: "company-2", name: "Nanonutricion", prefix: "NN", isActive: true },
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
cd apps/api && npx jest --watchman=false --config ./test/jest-e2e.json orders -t "no es la del cliente"
```

Esperado: FAIL con status 201 en vez de 400.

- [ ] **Step 3: Agregar el guard**

En `apps/api/src/modules/orders/orders.service.ts`, dentro de `create`, justo después del bloque que valida que la empresa exista y esté activa:

```typescript
    if (customer.companyId !== dto.companyId) {
      throw new BadRequestException("Order company does not match customer company");
    }
```

`BadRequestException` ya está importado en este archivo.

- [ ] **Step 4: Correr los tests y verificar que pasan**

```bash
cd apps/api && npx jest --watchman=false --config ./test/jest-e2e.json orders
```

Esperado: PASS. Si otros tests de este archivo empiezan a fallar con 400, es porque sus stubs de cliente no tienen `companyId` igual al `companyId` que mandan: agregárselo.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/orders/orders.service.ts apps/api/test/orders.e2e-spec.ts
git commit -m "feat(pedidos): la empresa de la orden debe coincidir con la del cliente"
```

---

### Task 4: No cambiar de empresa a un cliente con órdenes

**Files:**
- Modify: `apps/api/src/modules/customers/customers.service.ts` (`update`, ~línea 123)
- Test: `apps/api/test/customers.e2e-spec.ts`

**Interfaces:**
- Consumes: `UpdateCustomerDto.companyId` de la Task 2.
- Produces: `400 "Cannot change company for a customer with orders"`.

- [ ] **Step 1: Escribir el test que falla**

En `apps/api/test/customers.e2e-spec.ts`:

```typescript
  it("no deja cambiar la empresa de un cliente que ya tiene ordenes", async () => {
    const response = await request(app.getHttpServer())
      .patch("/customers/customer-with-orders")
      .set("Authorization", `Bearer ${global.__ADMIN_TOKEN__}`)
      .send({ companyId: "clx_default_nanonutricion" });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain("with orders");
  });
```

Asegurar que el stub de `prisma.order.count` devuelva `1` para `customerId === "customer-with-orders"` y `0` para el resto:

```typescript
      order: {
        count: async ({ where }: { where: { customerId: string } }) =>
          where.customerId === "customer-with-orders" ? 1 : 0,
      },
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
cd apps/api && npx jest --watchman=false --config ./test/jest-e2e.json customers -t "ya tiene ordenes"
```

Esperado: FAIL con 200 en vez de 400.

- [ ] **Step 3: Agregar el guard**

En `apps/api/src/modules/customers/customers.service.ts`, dentro de `update`, después del bloque que valida `dto.segmentId`:

```typescript
    if (dto.companyId && dto.companyId !== customer.companyId) {
      const company = await this.prisma.company.findUnique({
        where: { id: dto.companyId },
      });

      if (!company || !company.isActive) {
        throw new NotFoundException("Company not found or inactive");
      }

      // Cambiar de empresa dejaria ordenes cuya empresa ya no coincide con la
      // del cliente, que es justo lo que valida OrdersService.create.
      const orderCount = await this.prisma.order.count({
        where: { customerId: id },
      });

      if (orderCount > 0) {
        throw new BadRequestException("Cannot change company for a customer with orders");
      }
    }
```

Y en el `data` del update, agregar:

```typescript
            companyId: dto.companyId,
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

```bash
cd apps/api && npx jest --watchman=false --config ./test/jest-e2e.json customers
```

Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/customers apps/api/test/customers.e2e-spec.ts
git commit -m "feat(clientes): bloquear cambio de empresa si el cliente ya tiene pedidos"
```

---

### Task 5: El import mapea hoja → empresa

**Files:**
- Modify: `apps/api/prisma/scripts/import-customers.ts`
- Test: `apps/api/prisma/scripts/import-customers.check.ts`

**Interfaces:**
- Consumes: los ids `clx_default_norgtech` y `clx_default_nanonutricion` de la Task 1.
- Produces: `Row.companyPrefix: "NT" | "NN"`, resuelto a `companyId` contra la tabla `Company`.

Se resuelve por `prefix` y no por id hardcodeado para que el script siga sirviendo si mañana se corre contra una base donde las empresas se crearon con otro id.

- [ ] **Step 1: Escribir el test que falla**

En `apps/api/prisma/scripts/import-customers.check.ts`, agregar al final antes del `console.log`:

```typescript
// Cada hoja pertenece a una empresa distinta.
assert.equal(COMPANY_PREFIX_BY_SHEET.NORGTECH, "NT");
assert.equal(COMPANY_PREFIX_BY_SHEET.NANONUTRICION, "NN");
```

Y agregar `COMPANY_PREFIX_BY_SHEET` al import de `./import-customers`.

- [ ] **Step 2: Correr el check y verificar que falla**

```bash
cd apps/api && npx ts-node --transpile-only prisma/scripts/import-customers.check.ts
```

Esperado: FAIL con `COMPANY_PREFIX_BY_SHEET is not defined` o error de tipos.

- [ ] **Step 3: Implementar el mapeo**

En `apps/api/prisma/scripts/import-customers.ts`, después de la constante `SELLER_ALIASES`:

```typescript
// Cada hoja del Excel es una razon social distinta. Se resuelve por prefijo y no
// por id para que el script sirva en cualquier base.
export const COMPANY_PREFIX_BY_SHEET = {
  NORGTECH: "NT",
  NANONUTRICION: "NN",
} as const;
```

Agregar a `type Row`:

```typescript
  companyPrefix: string;
```

En el `byKey.set` de la hoja NORGTECH, agregar:

```typescript
      companyPrefix: COMPANY_PREFIX_BY_SHEET.NORGTECH,
```

En el `byKey.set` de la hoja Nanonutrición, agregar:

```typescript
      companyPrefix: COMPANY_PREFIX_BY_SHEET.NANONUTRICION,
```

En `importCustomers`, después de la validación del segmento:

```typescript
  const companies = await prisma.company.findMany({
    where: { prefix: { in: Object.values(COMPANY_PREFIX_BY_SHEET) } },
    select: { id: true, prefix: true },
  });
  const companyIdByPrefix = new Map(companies.map((c) => [c.prefix, c.id]));

  for (const prefix of Object.values(COMPANY_PREFIX_BY_SHEET)) {
    if (!companyIdByPrefix.has(prefix)) {
      throw new Error(`Falta la empresa con prefijo "${prefix}"; corre las migraciones primero.`);
    }
  }
```

En el objeto `data` del bucle de upsert, agregar:

```typescript
      companyId: companyIdByPrefix.get(row.companyPrefix)!,
```

- [ ] **Step 4: Correr el check y verificar que pasa**

```bash
cd apps/api && npx ts-node --transpile-only prisma/scripts/import-customers.check.ts
```

Esperado: `import-customers: OK`.

- [ ] **Step 5: Correr el import completo y confirmar que es idempotente**

```bash
cd apps/api
DATABASE_URL="$DEV_DATABASE_URL" \
  npx ts-node --transpile-only prisma/scripts/import-customers.ts \
  "/Users/xstaked/Downloads/LISTA DE CLIENTES NORGTECH Y NANONUTRICÓN.xlsx"
```

Esperado: `Clientes creados: 0`, `Clientes actualizados: 518`. Cero creados confirma que el mapeo no rompió las claves.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/scripts/import-customers.ts apps/api/prisma/scripts/import-customers.check.ts
git commit -m "feat(clientes): el import asigna la empresa segun la hoja de origen"
```

---

### Task 6: Web — columna Pago, empresa y selector en el formulario

**Files:**
- Modify: `apps/web/src/app/(app)/customers/page.tsx` (columna `credit`, líneas 109-118; columna `customer`, líneas 77-89)
- Modify: `apps/web/src/components/customers/customer-form.tsx` (interfaz `Customer` ~línea 29, `CustomerFormProps` ~línea 38, submit ~línea 91, JSX del select de segmento ~línea 158)
- Modify: `apps/web/src/app/(app)/customers/new/page.tsx` y `apps/web/src/app/(app)/customers/[id]/edit/page.tsx` (pasar `companies` al form)

**Interfaces:**
- Consumes: `company: { id, name }` de `findAll` (Task 2) y `companyId` en el payload de create/update (Tasks 2 y 4).
- Produces: nada que consuman otras tareas.

- [ ] **Step 1: Etiqueta legible de condición de pago**

En `apps/web/src/app/(app)/customers/page.tsx`, junto a `getPrimaryContact`:

```tsx
const PAYMENT_LABELS: Record<string, string> = {
  contado: "Contado",
  credito_15: "Crédito 15 días",
  credito_30: "Crédito 30 días",
  credito_60: "Crédito 60 días",
  credito_90: "Crédito 90 días",
};

function paymentLabel(condition: string | null) {
  if (!condition) return "Contado";
  return PAYMENT_LABELS[condition] ?? condition;
}
```

- [ ] **Step 2: Reemplazar la columna Crédito por Pago**

Sustituir el bloque de la columna `credit` completo por:

```tsx
  {
    key: "payment",
    header: "Pago",
    render: (row) => (
      <div style={{ display: "grid", gap: 2 }}>
        <span>{paymentLabel(row.paymentCondition)}</span>
        {row.creditLimit && (
          <span style={{ fontSize: 12, color: "#6b7787" }}>Cupo {row.creditLimit}</span>
        )}
      </div>
    ),
  },
```

- [ ] **Step 3: Mostrar la empresa en la celda Cliente**

En la columna `customer`, agregar después del `<span>` de `legalName`:

```tsx
        <span style={{ fontSize: 12, color: "#6b7787" }}>{row.company?.name}</span>
```

Agregar `company` y `paymentCondition` al tipo `CustomerRow` (o al tipo `Customer` del que deriva, en el mismo archivo):

```tsx
  paymentCondition: string | null;
  company: { id: string; name: string } | null;
```

- [ ] **Step 4: Verificar en el navegador**

```bash
cd apps/web && pnpm dev
```

Abrir `http://localhost:3000/customers`. Esperado: la columna dice **Pago** con valores "Contado" / "Crédito 30 días", y bajo cada razón social aparece "Norgtech" o "Nanonutrición".

- [ ] **Step 5: Selector de empresa en el formulario**

En `apps/web/src/components/customers/customer-form.tsx`, agregar a la interfaz `Customer`:

```typescript
  companyId: string | null;
```

A `CustomerFormProps`:

```typescript
  companies: { id: string; name: string }[];
```

A la firma: `export function CustomerForm({ segments, companies, customer }: CustomerFormProps) {`

Al payload del submit, junto a `segmentId`:

```typescript
      companyId: String(formData.get("companyId")),
```

Y el bloque JSX inmediatamente después del `<div>` del select de segmento:

```tsx
      <div className="grid gap-1">
        <Label>Empresa *</Label>
        <select
          name="companyId"
          required
          className={selectClasses}
          defaultValue={customer?.companyId ?? ""}
        >
          <option value="">Seleccionar empresa</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
```

- [ ] **Step 6: Pasar `companies` desde las dos páginas que usan el form**

En `apps/web/src/app/(app)/customers/new/page.tsx` y `apps/web/src/app/(app)/customers/[id]/edit/page.tsx`, junto al fetch de segmentos:

```tsx
  const companiesResponse = await apiFetch("/companies");
  const companies = companiesResponse.ok ? await companiesResponse.json() : [];
```

Y pasarlo: `<CustomerForm segments={segments} companies={companies} customer={customer} />`

- [ ] **Step 7: Verificar el alta de un cliente**

Con `pnpm dev` corriendo, ir a `http://localhost:3000/customers/new`, llenar el formulario eligiendo Nanonutrición y guardar.

Esperado: el cliente se crea y aparece en la lista con "Nanonutrición" bajo la razón social. Enviar el formulario sin elegir empresa debe bloquearse en el navegador por el `required`.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/\(app\)/customers apps/web/src/components/customers/customer-form.tsx
git commit -m "feat(web): columna de condicion de pago y empresa en clientes"
```

---

## Verificación final

- [ ] Suite completa de la API en verde:

```bash
cd apps/api && npx jest --watchman=false --config ./test/jest-e2e.json
```

- [ ] Self-check del import:

```bash
cd apps/api && npx ts-node --transpile-only prisma/scripts/import-customers.check.ts
```

- [ ] Reparto final por empresa:

```bash
psql "$DEV_DATABASE_URL" \
  -c 'select co.name, count(*) from "Customer" c join "Company" co on co.id=c."companyId" group by 1;'
```

Esperado: Norgtech 506, Nanonutrición 12.

## Pendiente con el cliente

El prefijo `NN` y la razón social `Nanonutrición S.A.S.` son supuestos. El prefijo numera las facturas, así que hay que confirmarlo **antes** de que se emita la primera factura de Nanonutrición. Cambiarlo después implica migrar numeración ya emitida.

---

### Task 7: Guard de empresa también al facturar directo

Añadida durante la ejecución. La review de la Task 3 encontró que `POST /invoices` deja abierto el
mismo agujero que la feature existe para cerrar.

**Files:**
- Modify: `apps/api/src/modules/invoices/invoices.service.ts` (`create`, líneas 61-68)
- Test: `apps/api/test/invoices.e2e-spec.ts`

**Interfaces:**
- Consumes: `Customer.companyId` (Task 1).
- Produces: `400 "Invoice company does not match customer company"`.

`createInvoiceFromOrder` ya está protegido transitivamente porque deriva `companyId` de una orden que
pasó por el guard de la Task 3. El hueco es la factura suelta.

- [ ] **Step 1: Escribir el test que falla**

En `apps/api/test/invoices.e2e-spec.ts`, siguiendo la convención de stubs del archivo, agregar un test
que haga `POST /invoices` con un `companyId` distinto al del cliente y espere `400`. El payload debe
ser válido en todo lo demás: si falta cualquier campo requerido del DTO, el 400 vendría de la
validación y el test sería un falso positivo.

- [ ] **Step 2: Correr y verificar que falla**

```bash
cd apps/api && npx jest --watchman=false --config ./test/jest-e2e.json invoices -t "empresa"
```

Esperado: FAIL con 201 en vez de 400.

- [ ] **Step 3: Agregar el guard**

En `apps/api/src/modules/invoices/invoices.service.ts`, dentro de `create`, después de que se resuelva
el cliente y se valide la empresa:

```typescript
    if (customer.companyId !== dto.companyId) {
      throw new BadRequestException("Invoice company does not match customer company");
    }
```

- [ ] **Step 4: Verificar que pasa y que muerde**

Correr el test. Luego neutralizar el guard, confirmar que el test falla, y restaurar.

- [ ] **Step 5: Suite completa y commit**

```bash
cd apps/api && npx jest --watchman=false --config ./test/jest-e2e.json
git add apps/api/src/modules/invoices apps/api/test/invoices.e2e-spec.ts
git commit -m "feat(facturacion): la empresa de la factura debe coincidir con la del cliente"
```
