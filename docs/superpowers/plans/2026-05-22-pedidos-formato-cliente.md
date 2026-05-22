# Pedidos Formato Cliente Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adaptar el módulo de pedidos para capturar, consultar y exportar la solicitud de pedido según `FORMATO PEDIDO CLIENTES2111 (1).xlsx`.

**Architecture:** El pedido seguirá siendo la entidad principal (`Order`/`OrderItem`), pero se ampliará con campos comerciales, despacho, receptor, facturación, aprobación e IVA. El frontend digitalizará el formulario del Excel y el backend expondrá exportación XLSX compatible con el layout del cliente.

**Tech Stack:** NestJS, Prisma, PostgreSQL, Next.js App Router, React, Playwright, Jest e2e.

---

## Scope

Esta fase implementa:

- Captura de los campos del formato real de solicitud de pedido.
- Cálculo de subtotal, IVA y total con IVA por item y por pedido.
- Snapshots de datos críticos del cliente en el pedido: empresa, NIT y dirección de despacho.
- Formulario web alineado al Excel: encabezado, solicitante, productos, instrucciones, receptor, factura y aprobación.
- Exportación de un pedido a `.xlsx` con el mismo layout base del archivo del cliente.
- Pruebas backend y frontend del flujo principal.

Esta fase no implementa:

- Importación masiva de múltiples pedidos desde Excel.
- Firma digital o aprobaciones multiusuario.
- Integración contable externa.
- Inventario, reservas o despacho físico.
- Cambio completo del módulo de cotizaciones.

## Business Mapping From Excel

Archivo fuente: `FORMATO PEDIDO CLIENTES2111 (1).xlsx`, hoja `FORMATO`, rango útil `B1:L28`.

Campos del formato y destino propuesto:

| Excel | Campo CRM | Modelo |
| --- | --- | --- |
| Consecutivo | `orderNumber` | `Order` |
| Orden Compra | `purchaseOrderNumber` | `Order` |
| Cliente / Empresa | `customerNameSnapshot` | `Order` |
| NIT | `customerNitSnapshot` | `Order` |
| Fecha | `orderDate` | `Order` |
| Dirección para Despacho | `dispatchAddressSnapshot` | `Order` |
| Solicitante | `requesterName` | `Order` |
| E-mail | `requesterEmail` | `Order` |
| Cargo | `requesterRole` | `Order` |
| Celular/Teléfono | `requesterPhone` | `Order` |
| Producto | `productSnapshotName` | `OrderItem` |
| Presentación | `presentationSnapshot` | `OrderItem` |
| Cantidad | `quantity` | `OrderItem` |
| Valor unidad | `unitPrice` | `OrderItem` |
| Valor IVA | `taxAmount` | `OrderItem` |
| Vr Total IVA Incl | `totalWithTax` | `OrderItem` |
| Consecutivo de cotización aprobada | `approvedQuoteConsecutive` | `Order` |
| Total pedido | `total` | `Order` |
| Observaciones / instrucciones | `deliveryInstructions` | `Order` |
| Persona autorizada para recibir | `receiverName` | `Order` |
| Correo electrónico | `receiverEmail` | `Order` |
| Teléfono | `receiverPhone` | `Order` |
| Cargo receptor | `receiverRole` | `Order` |
| Lugar de radicación de factura | `invoiceFilingPlace` | `Order` |
| Aprobación | `approvalStatus` | `Order` |
| Motivo | `approvalReason` | `Order` |
| Nombre | `approvalName` | `Order` |
| Fecha de revisión | `reviewDate` | `Order` |
| Elaboró | `preparedByName` | `Order` |
| Zona | `zone` | `Order` |
| Cargo | `preparedByRole` | `Order` |

## File Structure

- Modify `apps/api/prisma/schema.prisma`
  - Add the new order header, requester, receiver, invoice, approval and tax fields.
- Create `apps/api/prisma/migrations/<timestamp>_order_customer_format/migration.sql`
  - Prisma migration for the new columns.
- Modify `apps/api/src/modules/orders/dto/create-order.dto.ts`
  - Accept the format fields with validation.
- Modify `apps/api/src/modules/orders/dto/create-order-item.dto.ts`
  - Accept presentation, custom product text, tax fields and explicit unit price.
- Modify `apps/api/src/modules/orders/orders.service.ts`
  - Normalize snapshots, validate customer-related records, compute item taxes and totals.
- Modify `apps/api/src/modules/orders/orders.controller.ts`
  - Add `GET /orders/:id/export` for XLSX export.
- Create `apps/api/src/modules/orders/order-xlsx-export.service.ts`
  - Generate the client-format workbook from an order.
- Modify `apps/api/src/modules/orders/orders.module.ts`
  - Register the export service.
- Modify `apps/api/test/orders.e2e-spec.ts`
  - Cover create, tax totals, customer consistency and export.
- Modify `apps/web/src/components/orders/order-form.tsx`
  - Rebuild the create form around the Excel sections.
- Modify `apps/web/src/app/(app)/orders/new/page.tsx`
  - Fetch only the data needed by the new form.
- Modify `apps/web/src/app/(app)/orders/[id]/page.tsx`
  - Display the new request, receiver, invoice, approval and tax fields.
- Modify `apps/web/src/components/orders/order-actions.tsx`
  - Add export action and keep existing status actions.
- Modify `apps/web/tests/e2e/orders.spec.ts`
  - Cover creating an order using the client format and exporting it.

## Data Model Decisions

- `orderNumber` is a human-facing consecutive. It must be unique and generated by the backend when omitted.
- `purchaseOrderNumber` is optional because not every customer may provide an external PO.
- `customerNameSnapshot`, `customerNitSnapshot` and `dispatchAddressSnapshot` are stored on the order to preserve the printed document even if the customer record changes later.
- Item `unitPrice` becomes the price actually used for the order. Product base price can prefill the UI, but the backend must respect submitted `unitPrice` for this phase.
- `taxPercent` defaults to `19.00` unless submitted. `taxAmount` is calculated as unit tax per item: `unitPrice * taxPercent / 100`. `totalWithTax` is `(unitPrice + taxAmount) * quantity`, matching the Excel formulas.
- The legacy `subtotal` remains net amount before tax. `total` becomes total with tax for order documents.
- `notes` remains general internal notes. `deliveryInstructions` maps the Excel observations/instructions field.

## Tasks

### Task 1: Extend Order Schema For Client Format

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_order_customer_format/migration.sql`

- [ ] **Step 1: Add Prisma fields to `Order`**

Add these fields to `model Order` after `sourceQuoteId` and before logistics fields:

```prisma
  orderNumber             String?   @unique
  purchaseOrderNumber     String?
  orderDate               DateTime  @default(now())
  customerNameSnapshot    String?
  customerNitSnapshot     String?
  dispatchAddressSnapshot String?
  requesterName           String?
  requesterEmail          String?
  requesterRole           String?
  requesterPhone          String?
  approvedQuoteConsecutive String?
  deliveryInstructions    String?
  receiverName            String?
  receiverEmail           String?
  receiverPhone           String?
  receiverRole            String?
  invoiceFilingPlace      String?
  approvalStatus          String?
  approvalReason          String?
  approvalName            String?
  reviewDate              DateTime?
  preparedByName          String?
  zone                    String?
  preparedByRole          String?
```

- [ ] **Step 2: Add Prisma fields to `OrderItem`**

Add these fields to `model OrderItem` near the existing snapshot and price fields:

```prisma
  presentationSnapshot String?
  customProductName    String?
  taxPercent           Decimal  @db.Decimal(5, 2) @default(19)
  taxAmount            Decimal  @db.Decimal(14, 2) @default(0)
  totalWithTax         Decimal  @db.Decimal(14, 2) @default(0)
```

- [ ] **Step 3: Create migration**

Run:

```bash
pnpm --filter api exec prisma migrate dev --name order_customer_format
```

Expected: a new migration folder is created and Prisma Client regenerates.

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(orders): model customer order format fields"
```

### Task 2: Update Backend DTOs And Validation

**Files:**
- Modify: `apps/api/src/modules/orders/dto/create-order.dto.ts`
- Modify: `apps/api/src/modules/orders/dto/create-order-item.dto.ts`
- Test: `apps/api/test/orders.e2e-spec.ts`

- [ ] **Step 1: Extend `CreateOrderDto`**

Add optional string/date fields matching the Excel format:

```ts
  @IsOptional()
  @IsString()
  orderNumber?: string;

  @IsOptional()
  @IsString()
  purchaseOrderNumber?: string;

  @IsOptional()
  @IsString()
  orderDate?: string;

  @IsOptional()
  @IsString()
  dispatchAddressSnapshot?: string;

  @IsOptional()
  @IsString()
  requesterName?: string;

  @IsOptional()
  @IsEmail()
  requesterEmail?: string;

  @IsOptional()
  @IsString()
  requesterRole?: string;

  @IsOptional()
  @IsString()
  requesterPhone?: string;

  @IsOptional()
  @IsString()
  approvedQuoteConsecutive?: string;

  @IsOptional()
  @IsString()
  deliveryInstructions?: string;

  @IsOptional()
  @IsString()
  receiverName?: string;

  @IsOptional()
  @IsEmail()
  receiverEmail?: string;

  @IsOptional()
  @IsString()
  receiverPhone?: string;

  @IsOptional()
  @IsString()
  receiverRole?: string;

  @IsOptional()
  @IsString()
  invoiceFilingPlace?: string;

  @IsOptional()
  @IsString()
  approvalStatus?: string;

  @IsOptional()
  @IsString()
  approvalReason?: string;

  @IsOptional()
  @IsString()
  approvalName?: string;

  @IsOptional()
  @IsString()
  reviewDate?: string;

  @IsOptional()
  @IsString()
  preparedByName?: string;

  @IsOptional()
  @IsString()
  zone?: string;

  @IsOptional()
  @IsString()
  preparedByRole?: string;
```

Also import `IsEmail` from `class-validator`.

- [ ] **Step 2: Extend `CreateOrderItemDto`**

Add product text, presentation and tax inputs:

```ts
  @IsOptional()
  @IsString()
  productName?: string;

  @IsOptional()
  @IsString()
  presentation?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  taxPercent?: number;
```

- [ ] **Step 3: Add failing backend e2e test**

In `apps/api/test/orders.e2e-spec.ts`, add a test that creates a pedido with requester, receiver, invoice and IVA fields. Expected response:

```ts
expect(response.body.purchaseOrderNumber).toBe("OC-7788");
expect(response.body.requesterName).toBe("Laura Cliente");
expect(response.body.receiverName).toBe("Carlos Bodega");
expect(Number(response.body.subtotal)).toBe(100000);
expect(Number(response.body.items[0].taxAmount)).toBe(19000);
expect(Number(response.body.items[0].totalWithTax)).toBe(119000);
expect(Number(response.body.total)).toBe(119000);
```

- [ ] **Step 4: Run test to verify it fails**

Run:

```bash
pnpm --filter api test -- orders.e2e-spec.ts
```

Expected: FAIL because service does not yet persist/calculates these fields.

- [ ] **Step 5: Commit DTO and test changes**

```bash
git add apps/api/src/modules/orders/dto/create-order.dto.ts apps/api/src/modules/orders/dto/create-order-item.dto.ts apps/api/test/orders.e2e-spec.ts
git commit -m "test(orders): define customer format payload"
```

### Task 3: Persist Snapshots, IVA And Client-Format Totals

**Files:**
- Modify: `apps/api/src/modules/orders/orders.service.ts`
- Test: `apps/api/test/orders.e2e-spec.ts`

- [ ] **Step 1: Normalize order header fields**

In `OrdersService.create`, derive these values after loading the customer:

```ts
const orderNumber = dto.orderNumber?.trim() || await this.nextOrderNumber();
const orderDate = dto.orderDate ? new Date(dto.orderDate) : new Date();
const customerNameSnapshot = customer.displayName;
const customerNitSnapshot = customer.taxId ?? null;
const dispatchAddressSnapshot = dto.dispatchAddressSnapshot?.trim() || customer.address || null;
```

- [ ] **Step 2: Make submitted unit price authoritative**

For product-backed items, keep product snapshots but calculate from `item.unitPrice`:

```ts
const unitPriceRounded = new Prisma.Decimal(item.unitPrice).toDecimalPlaces(2);
const taxPercent = new Prisma.Decimal(item.taxPercent ?? 19).toDecimalPlaces(2);
const taxAmount = unitPriceRounded.times(taxPercent).dividedBy(100).toDecimalPlaces(2);
const subtotal = new Prisma.Decimal(item.quantity).times(unitPriceRounded).toDecimalPlaces(2);
const totalWithTax = new Prisma.Decimal(item.quantity).times(unitPriceRounded.plus(taxAmount)).toDecimalPlaces(2);
```

- [ ] **Step 3: Support custom product rows from the form**

When `item.productId` is missing, use:

```ts
productSnapshotName: item.productName?.trim() || "Custom item",
productSnapshotSku: "CUSTOM",
unit: "unit",
presentationSnapshot: item.presentation?.trim() || null,
customProductName: item.productName?.trim() || null,
```

- [ ] **Step 4: Persist all header fields on `tx.order.create`**

Add the mapped fields:

```ts
orderNumber,
purchaseOrderNumber: dto.purchaseOrderNumber || null,
orderDate,
customerNameSnapshot,
customerNitSnapshot,
dispatchAddressSnapshot,
requesterName: dto.requesterName || null,
requesterEmail: dto.requesterEmail || null,
requesterRole: dto.requesterRole || null,
requesterPhone: dto.requesterPhone || null,
approvedQuoteConsecutive: dto.approvedQuoteConsecutive || null,
deliveryInstructions: dto.deliveryInstructions || null,
receiverName: dto.receiverName || dto.requesterName || null,
receiverEmail: dto.receiverEmail || dto.requesterEmail || null,
receiverPhone: dto.receiverPhone || dto.requesterPhone || null,
receiverRole: dto.receiverRole || dto.requesterRole || null,
invoiceFilingPlace: dto.invoiceFilingPlace || dispatchAddressSnapshot,
approvalStatus: dto.approvalStatus || null,
approvalReason: dto.approvalReason || null,
approvalName: dto.approvalName || null,
reviewDate: dto.reviewDate ? new Date(dto.reviewDate) : null,
preparedByName: dto.preparedByName || user.name,
zone: dto.zone || null,
preparedByRole: dto.preparedByRole || null,
```

- [ ] **Step 5: Add `nextOrderNumber` helper**

Add a simple consecutive generator:

```ts
private async nextOrderNumber() {
  const count = await this.prisma.order.count();
  return `PED-${String(count + 1).padStart(6, "0")}`;
}
```

If concurrent creation becomes a production concern, replace this later with a database sequence.

- [ ] **Step 6: Run backend tests**

Run:

```bash
pnpm --filter api test -- orders.e2e-spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/orders/orders.service.ts apps/api/test/orders.e2e-spec.ts
git commit -m "feat(orders): persist customer format order details"
```

### Task 4: Validate Customer Consistency

**Files:**
- Modify: `apps/api/src/modules/orders/orders.service.ts`
- Test: `apps/api/test/orders.e2e-spec.ts`

- [ ] **Step 1: Add failing tests**

Add tests that reject:

```ts
expect(response.body.message).toBe("Opportunity does not belong to customer");
expect(response.body.message).toBe("Quote does not belong to customer");
```

- [ ] **Step 2: Replace existence-only assertions**

Change opportunity and quote checks to load and compare `customerId`:

```ts
private async assertOpportunityBelongsToCustomer(opportunityId: string, customerId: string) {
  const opportunity = await this.prisma.opportunity.findUnique({ where: { id: opportunityId } });
  if (!opportunity) throw new NotFoundException("Opportunity not found");
  if (opportunity.customerId !== customerId) {
    throw new BadRequestException("Opportunity does not belong to customer");
  }
}

private async assertQuoteBelongsToCustomer(quoteId: string, customerId: string) {
  const quote = await this.prisma.quote.findUnique({ where: { id: quoteId } });
  if (!quote) throw new NotFoundException("Quote not found");
  if (quote.customerId !== customerId) {
    throw new BadRequestException("Quote does not belong to customer");
  }
}
```

- [ ] **Step 3: Run backend tests**

Run:

```bash
pnpm --filter api test -- orders.e2e-spec.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/orders/orders.service.ts apps/api/test/orders.e2e-spec.ts
git commit -m "fix(orders): enforce customer consistency"
```

### Task 5: Rebuild Web Order Form Around Excel Sections

**Files:**
- Modify: `apps/web/src/components/orders/order-form.tsx`
- Modify: `apps/web/src/app/(app)/orders/new/page.tsx`
- Test: `apps/web/tests/e2e/orders.spec.ts`

- [ ] **Step 1: Add e2e coverage for client-format form**

Update `apps/web/tests/e2e/orders.spec.ts` so the create-order test fills:

```ts
await page.getByLabel("Orden de compra").fill("OC-7788");
await page.getByLabel("Solicitante").fill("Laura Cliente");
await page.getByLabel("E-mail").fill("laura@example.com");
await page.getByLabel("Celular/Teléfono").fill("3174407575");
await page.getByLabel("Persona autorizada para recibir").fill("Carlos Bodega");
await page.getByLabel("Lugar de radicación de la factura").fill("Oficina principal");
await page.getByLabel("Zona").fill("Norte");
await page.getByLabel("Valor IVA").fill("19000");
```

- [ ] **Step 2: Split the form visually into sections**

Keep one component for now, but group fields as:

```tsx
<section aria-labelledby="pedido-header">...</section>
<section aria-labelledby="solicitante">...</section>
<section aria-labelledby="productos">...</section>
<section aria-labelledby="entrega-factura">...</section>
<section aria-labelledby="aprobacion">...</section>
```

- [ ] **Step 3: Add state for new header fields**

Use form fields with names matching DTO:

```tsx
<Input name="purchaseOrderNumber" aria-label="Orden de compra" />
<Input name="requesterName" aria-label="Solicitante" />
<Input name="requesterEmail" aria-label="E-mail" type="email" />
<Input name="requesterRole" aria-label="Cargo solicitante" />
<Input name="requesterPhone" aria-label="Celular/Teléfono" />
<Textarea name="deliveryInstructions" aria-label="Observaciones y/o instrucciones de entrega" />
<Input name="receiverName" aria-label="Persona autorizada para recibir" />
<Input name="receiverEmail" aria-label="Correo electrónico receptor" type="email" />
<Input name="receiverPhone" aria-label="Teléfono receptor" />
<Input name="receiverRole" aria-label="Cargo receptor" />
<Input name="invoiceFilingPlace" aria-label="Lugar de radicación de la factura" />
<Input name="zone" aria-label="Zona" />
```

- [ ] **Step 4: Update item state**

Use:

```ts
interface OrderItem {
  productId: string;
  productName: string;
  presentation: string;
  quantity: number;
  unitPrice: number;
  taxPercent: number;
  notes: string;
}
```

Calculate:

```ts
const taxAmount = item.unitPrice * (item.taxPercent / 100);
const totalWithTax = (item.unitPrice + taxAmount) * item.quantity;
```

- [ ] **Step 5: Send custom items instead of filtering them out**

Replace the current filter with:

```ts
.filter((item) => (item.productId || item.productName.trim()) && item.quantity > 0)
.map((item) => ({
  productId: item.productId || undefined,
  productName: item.productName || undefined,
  presentation: item.presentation || undefined,
  quantity: item.quantity,
  unitPrice: item.unitPrice,
  taxPercent: item.taxPercent,
  notes: item.notes,
}))
```

- [ ] **Step 6: Run frontend e2e**

Run:

```bash
pnpm --filter web test:e2e -- orders.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/orders/order-form.tsx apps/web/src/app/'(app)'/orders/new/page.tsx apps/web/tests/e2e/orders.spec.ts
git commit -m "feat(orders): capture client order format in web form"
```

### Task 6: Show Client-Format Fields On Order Detail

**Files:**
- Modify: `apps/web/src/app/(app)/orders/[id]/page.tsx`

- [ ] **Step 1: Extend frontend `Order` and `OrderItem` interfaces**

Add all new fields used by the detail page:

```ts
orderNumber: string | null;
purchaseOrderNumber: string | null;
customerNameSnapshot: string | null;
customerNitSnapshot: string | null;
dispatchAddressSnapshot: string | null;
requesterName: string | null;
requesterEmail: string | null;
requesterRole: string | null;
requesterPhone: string | null;
receiverName: string | null;
receiverEmail: string | null;
receiverPhone: string | null;
receiverRole: string | null;
invoiceFilingPlace: string | null;
approvalStatus: string | null;
approvalReason: string | null;
approvalName: string | null;
reviewDate: string | null;
preparedByName: string | null;
zone: string | null;
preparedByRole: string | null;
```

For items:

```ts
presentationSnapshot: string | null;
taxPercent: string;
taxAmount: string;
totalWithTax: string;
```

- [ ] **Step 2: Render sections matching the Excel**

Add display sections below the status timeline:

```tsx
<h3>Datos del pedido</h3>
<h3>Solicitante</h3>
<h3>Productos</h3>
<h3>Entrega y facturación</h3>
<h3>Aprobación</h3>
```

- [ ] **Step 3: Update item display**

Show unit price, IVA and total IVA included:

```tsx
${Number(item.unitPrice).toLocaleString("es-CO")} + IVA ${Number(item.taxAmount).toLocaleString("es-CO")}
${Number(item.totalWithTax).toLocaleString("es-CO")}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/'(app)'/orders/'[id]'/page.tsx
git commit -m "feat(orders): show customer format details"
```

### Task 7: Export Order To Client Excel Format

**Files:**
- Create: `apps/api/src/modules/orders/order-xlsx-export.service.ts`
- Modify: `apps/api/src/modules/orders/orders.controller.ts`
- Modify: `apps/api/src/modules/orders/orders.module.ts`
- Test: `apps/api/test/orders.e2e-spec.ts`

- [ ] **Step 1: Add export service**

Create `OrderXlsxExportService` that loads `FORMATO PEDIDO CLIENTES2111 (1).xlsx` as a template and writes values into:

```txt
C5 = order.purchaseOrderNumber
E5 = order.customerNameSnapshot
J5 = order.customerNitSnapshot
L5 = order.orderDate
E6 = order.dispatchAddressSnapshot
C7 = order.requesterName
I7 = order.requesterEmail
C8 = order.requesterRole
J8 = order.requesterPhone
B10:B16 = item.productSnapshotName
F10:F16 = item.presentationSnapshot
I10:I16 = item.quantity
J10:J16 = item.unitPrice
K10:K16 = item.taxAmount
H17 = order.approvedQuoteConsecutive
L17 = order.total
B20 = order.deliveryInstructions
J19 = order.receiverName
J20 = order.receiverEmail
J21 = order.receiverPhone
J22 = order.receiverRole
J23 = order.invoiceFilingPlace
J25 = order.approvalStatus
J26 = order.approvalReason
J27 = order.approvalName
L26 = order.reviewDate
B28 = order.preparedByName
F28 = order.zone
J28 = order.preparedByRole
```

- [ ] **Step 2: Add controller route**

Add:

```ts
@Get(":id/export")
exportOrder(@Param("id") id: string, @Res() response: Response) {
  return this.ordersService.exportClientFormat(id, response);
}
```

Use Nest response streaming with the correct content type:

```txt
application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
```

- [ ] **Step 3: Add e2e export test**

Assert:

```ts
expect(response.headers["content-type"]).toContain("spreadsheetml.sheet");
expect(response.body.length).toBeGreaterThan(1000);
```

- [ ] **Step 4: Run backend tests**

Run:

```bash
pnpm --filter api test -- orders.e2e-spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/orders/order-xlsx-export.service.ts apps/api/src/modules/orders/orders.controller.ts apps/api/src/modules/orders/orders.module.ts apps/api/test/orders.e2e-spec.ts
git commit -m "feat(orders): export customer order xlsx"
```

### Task 8: Add Export Action In Web Detail

**Files:**
- Modify: `apps/web/src/components/orders/order-actions.tsx`
- Test: `apps/web/tests/e2e/orders.spec.ts`

- [ ] **Step 1: Add export link**

Add a button/link:

```tsx
<Button asChild variant="outline">
  <a href={`${process.env.NEXT_PUBLIC_API_URL}/orders/${orderId}/export`} target="_blank" rel="noreferrer">
    Exportar formato Excel
  </a>
</Button>
```

If auth cookies are not available to the API domain, replace this with a client fetch that attaches the token and downloads a blob.

- [ ] **Step 2: Add e2e visibility check**

Assert:

```ts
await expect(page.getByRole("link", { name: "Exportar formato Excel" })).toBeVisible();
```

- [ ] **Step 3: Run frontend e2e**

Run:

```bash
pnpm --filter web test:e2e -- orders.spec.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/orders/order-actions.tsx apps/web/tests/e2e/orders.spec.ts
git commit -m "feat(orders): expose excel export action"
```

### Task 9: Regression And Release Check

**Files:**
- No source edits unless verification finds defects.

- [ ] **Step 1: Run API tests**

Run:

```bash
pnpm --filter api test
```

Expected: PASS.

- [ ] **Step 2: Run web build**

Run:

```bash
pnpm --filter web build
```

Expected: PASS.

- [ ] **Step 3: Run order e2e**

Run:

```bash
pnpm --filter web test:e2e -- orders.spec.ts
```

Expected: PASS.

- [ ] **Step 4: Manual acceptance check**

Create a pedido with:

```txt
Orden de compra: OC-7788
Solicitante: Laura Cliente
Producto: Producto de prueba
Cantidad: 1
Valor unidad: 100000
IVA: 19%
Persona autorizada: Carlos Bodega
Lugar de radicación factura: Oficina principal
Zona: Norte
```

Expected:

```txt
Subtotal: 100000
IVA unitario: 19000
Total pedido: 119000
Detalle muestra solicitante, receptor, facturación y zona
Exportación descarga un .xlsx con los campos en el formato del cliente
```

- [ ] **Step 5: Final commit if verification fixes were needed**

```bash
git status --short
git add <changed-files>
git commit -m "fix(orders): complete customer format verification"
```

## Acceptance Criteria

- Un usuario autorizado puede crear un pedido con los mismos datos que contiene `FORMATO PEDIDO CLIENTES2111 (1).xlsx`.
- El backend persiste snapshots de cliente, NIT y dirección.
- Los items calculan IVA y total IVA incluido.
- El total del pedido coincide con la suma de `totalWithTax`.
- La UI no descarta items personalizados.
- La UI no muestra un total estimado distinto al total real enviado.
- La oportunidad y la cotización origen deben pertenecer al mismo cliente del pedido.
- El detalle del pedido muestra las secciones equivalentes al formato Excel.
- El pedido puede exportarse a `.xlsx` con el layout del cliente.
- Las pruebas de pedidos backend y frontend pasan.

## Risks And Mitigations

- **Consecutivo concurrente:** `count + 1` puede duplicarse bajo alta concurrencia. Para MVP se acepta; para producción robusta usar secuencia de base de datos.
- **Exportación XLSX:** si no existe una librería Excel instalada en API, agregar una dependencia explícita como `exceljs` y mantener el template en una ruta versionada.
- **Auth en descarga web:** si el API requiere bearer token y el link directo no lo envía, implementar descarga con `fetch`, `Authorization` y `Blob`.
- **Campos de aprobación:** esta fase captura texto, no workflow formal. Si el cliente requiere aprobadores reales, eso debe ser una fase posterior.

## Suggested Phase Name

**Fase: Pedidos según formato operativo del cliente**

## Suggested Next Phase

**Importación de pedidos desde Excel:** permitir subir `FORMATO PEDIDO CLIENTES2111 (1).xlsx`, leer celdas conocidas, prellenar el formulario y confirmar antes de guardar.
