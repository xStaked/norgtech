# Special Pricing and Financial Traceability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar precios especiales solo a operaciones atribuidas a su comercial propietario y conservar su origen e importes desde cotización/pedido hasta facturación y cartera.

**Architecture:** `PricingService` recibirá el vendedor de la operación y buscará primero una revisión especial activa para vendedor + cliente + presentación; luego mantendrá los fallbacks generales vigentes. Cotizaciones y pedidos guardarán snapshots inmutables de precio, origen y moneda; pedidos desde cotización reutilizarán esos snapshots.

**Tech Stack:** NestJS 11, Prisma 6/PostgreSQL, Next.js 16, Jest/Supertest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-06-gestion-listas-precios-design.md`

**Dependency:** ejecutar después de `docs/superpowers/plans/2026-10-06-price-list-management.md`.

## Global Constraints

- Un precio especial solo aplica si coincide propietario, cliente y presentación, y su revisión está aprobada y activa.
- Sin coincidencia especial, conservar lista general y fallback a precio base/descuento actuales.
- Vista previa y creación deben resolver los mismos importes; preview recibe identidad desde JWT, no del body.
- Factura y cartera muestran valores facturados/pagos/saldos existentes; no se agrega contabilidad.
- Cambios futuros de lista no modifican documentos comerciales ya guardados.

## Review Focus

- **Segundo comercial cotiza el mismo cliente:** no recibe el precio especial del propietario; test de Task 1.
- **Combinación especial sin fila:** cae a lista general y luego al fallback base vigente; test de Task 1.
- **Revisión nueva pendiente/rechazada:** permanece activa la revisión aprobada previa; test de Task 1.
- **Pedido creado desde cotización antigua:** conserva su precio/origen aunque cambie la lista después; test de Task 2.
- **Moneda USD y abonos/notas crédito:** no se muestran como COP, no se suman valores COP+USD sin conversión y el saldo no usa una fórmula distinta; test de Task 3.

---

### Task 1: Resolver precios por vendedor y mantener preview/create parity

**Files:**
- Modify: `apps/api/src/modules/pricing/pricing.types.ts`, `pricing.service.ts`
- Modify: `apps/api/src/modules/quotes/quotes.controller.ts`, `quotes.service.ts`
- Modify: `apps/api/src/modules/orders/orders.controller.ts`, `orders.service.ts`
- Modify: `apps/api/test/pricing-preview.e2e-spec.ts`, `apps/api/test/price-lists-special.e2e-spec.ts`

**Interfaces:**
- Consumes: `SpecialPriceListRevision.active`, owner, clientes e ítems de `price-list-management`.
- Produces: `PricingService.buildPreview(customer, items, mode, sellerUserId)` y `priceLines(customer, items, mode, sellerUserId)`; `PriceSource` añade `special_price_list`; `PricedLine` devuelve lista/origen y moneda.

- [ ] **Step 1: Añadir pruebas fallidas** `owner uses approved special price`, `another seller falls back to the customer's general list`, `missing special presentation preserves existing fallback`, y `quote/order preview matches create`. Assert unit price, `priceSource`, list id/name, actor aplicado y subtotales.
- [ ] **Step 2: Ejecutar specs dirigidos y comprobar fallo**

Run: `pnpm --filter @norgtech/api exec jest --config ./test/jest-e2e.json --runInBand test/price-lists-special.e2e-spec.ts test/pricing-preview.e2e-spec.ts`
Expected: FAIL por resolución sin vendedor y preview sin contexto de sesión.

- [ ] **Step 3: Implementar resolución de precios** antes de consultar lista general; limitar la búsqueda a revisión activa aprobada + seller id + customer id + presentation id. Si no existe match, no alterar el flujo actual de lista general/base.
- [ ] **Step 4: Pasar identidad autenticada** a quote preview/create y seller resuelto a order preview/create; ignorar cualquier identidad enviada por el cliente.
- [ ] **Step 5: Correr los specs y commit**

```bash
git add apps/api/src/modules/pricing apps/api/src/modules/quotes apps/api/src/modules/orders apps/api/test/price-lists-special.e2e-spec.ts apps/api/test/pricing-preview.e2e-spec.ts
git commit -m "feat(api): resolve seller-scoped special prices"
```

### Task 2: Snapshots inmutables quote → pedido → factura

**Files:**
- Modify: `apps/api/prisma/schema.prisma` y migración nueva
- Create: `apps/api/prisma/migrations/<generated_timestamp>_pricing_document_snapshots/migration.sql`
- Modify: `apps/api/src/modules/quotes/quotes.service.ts`, `orders.service.ts`
- Modify: `apps/api/test/pricing-preview.e2e-spec.ts`, `orders.e2e-spec.ts`, `invoices.e2e-spec.ts`

**Interfaces:**
- Consumes: `PricedLine` de Task 1.
- Produces: snapshots de moneda y origen (`priceSource`, `priceListIdSnapshot`, `priceListNameSnapshot`) en quote/order items, `taxPercentSnapshot` en QuoteItem y moneda snapshot en encabezados; pedido desde cotización reutiliza valores guardados, no consulta precios actuales.

- [ ] **Step 1: Añadir pruebas fallidas** `quote and order persist price source and currency snapshots`, `order created from quote preserves its approved unit price after list update`, y `invoice created from order preserves subtotal tax and total`. Assert importes/origen guardados y moneda.
- [ ] **Step 2: Ejecutar pruebas y confirmar fallo**

Run: `pnpm --filter @norgtech/api exec jest --config ./test/jest-e2e.json --runInBand test/pricing-preview.e2e-spec.ts test/orders*.e2e-spec.ts`
Expected: FAIL en snapshots/copia de cotización.

- [ ] **Step 3: Agregar campos snapshot a Quote/QuoteItem, Order/OrderItem e Invoice**, incluyendo `taxPercentSnapshot` en QuoteItem, con migración compatible: backfill de moneda desde el Customer relacionado y origen `legacy` en documentos existentes. No agregar FKs que invaliden snapshots si cambia el catálogo.
- [ ] **Step 4: Persistir los snapshots desde `PricedLine`; para pedidos con `sourceQuoteId`, reutilizar unit price, presentación, origen y moneda de QuoteItem, calculando los totales/impuestos según los valores guardados y reglas actuales del flujo.
- [ ] **Step 5: Verificar prueba de factura desde pedido y pruebas dirigidas; commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/*_pricing_document_snapshots/migration.sql apps/api/src/modules/quotes/quotes.service.ts apps/api/src/modules/orders/orders.service.ts apps/api/test/pricing-preview.e2e-spec.ts apps/api/test/orders.e2e-spec.ts apps/api/test/invoices.e2e-spec.ts
git commit -m "feat(api): preserve price source across quotes and orders"
```

### Task 3: Presentación simple de origen y moneda en documentos financieros

**Files:**
- Modify: `apps/web/src/app/(app)/quotes/[id]/page.tsx`
- Modify: `apps/web/src/app/(app)/orders/[id]/page.tsx`
- Modify: `apps/web/src/app/(app)/invoices/[id]/page.tsx`, `invoices/page.tsx`, `invoices/debtors/page.tsx`, `invoices/accounting/page.tsx`
- Modify: `apps/web/tests/e2e/quote-pricing.spec.ts`; add E2E for order/invoice currency/source.

**Interfaces:**
- Consumes: API snapshot fields de Task 2.
- Produces: etiqueta clara de origen del precio y cifras formateadas con currency snapshot; total/pagado/saldo siguen el cálculo de cartera actual.

- [ ] **Step 1: Añadir E2E fallidos** `quote and order detail show price source in the customer's currency` y `invoice and debtors views format total paid and balance using invoice currency`. Assert etiquetas de origen, USD vs COP y saldo incluyendo notas crédito.
- [ ] **Step 2: Ejecutar los E2E para confirmar fallo**

Run: `pnpm --filter @norgtech/web exec playwright test tests/e2e/quote-pricing.spec.ts tests/e2e/special-pricing-trace.spec.ts`
Expected: FAIL en origen/moneda ausentes o mal formateados.

- [ ] **Step 3: Actualizar detalles quote/order** con etiqueta de origen y formateo COP/USD según snapshot; mantener las cifras guardadas sin volver a calcularlas desde listas actuales.
- [ ] **Step 4: Actualizar invoice, listados de cartera, deudores y reportes contables** para usar la moneda de factura; preservar fórmula total − pagos − notas crédito existente y presentar agregados COP/USD por separado, sin sumar monedas distintas.
- [ ] **Step 5: Ejecutar E2E y build web; commit**

Run: `pnpm --filter @norgtech/web exec playwright test tests/e2e/quote-pricing.spec.ts tests/e2e/special-pricing-trace.spec.ts` y `pnpm --filter @norgtech/web build`
Expected: PASS.

```bash
git add apps/web/src/app/'(app)'/quotes/'[id]'/page.tsx apps/web/src/app/'(app)'/orders/'[id]'/page.tsx apps/web/src/app/'(app)'/invoices/'[id]'/page.tsx apps/web/src/app/'(app)'/invoices/page.tsx apps/web/src/app/'(app)'/invoices/debtors/page.tsx apps/web/src/app/'(app)'/invoices/accounting/page.tsx apps/web/tests/e2e/quote-pricing.spec.ts apps/web/tests/e2e/special-pricing-trace.spec.ts
git commit -m "feat(web): show special price source and currency"
```
