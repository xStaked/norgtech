# MVP Gap Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining non-WhatsApp MVP gaps so the CRM satisfies the required operational flow for customers, agenda, visits, quotes, billing requests, orders, logistics tracking, and role-based access.

**Architecture:** Keep the current modular monolith shape: `apps/api` remains the source of truth for domain rules, transitions, permissions, and audit; `apps/web` remains the operator-facing interface. Execute the work as incremental vertical slices, starting with customer 360 and permissions before adding automation, logistics enrichment, and executive reporting.

**Tech Stack:** Next.js App Router, Nest.js, Prisma ORM, PostgreSQL, JWT auth, Playwright, Jest, TypeScript

---

## Scope

This plan covers the missing work for the requested MVP review, excluding WhatsApp.

Included:

- customer 360 history
- business roles and permissions
- operational agenda automation
- stronger billing and logistics flow
- executive PDF reporting
- ROI/cost calculator integration foundation

Excluded:

- WhatsApp assistant
- customer portal
- advanced BI
- advanced marketing automation

## Delivery order

1. Customer 360 history
2. Roles and permission matrix
3. Agenda automation and operator queues
4. Orders, billing, and logistics hardening
5. Executive PDF and calculator integration

## File map

### Backend domain files likely to change

- Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/prisma/seed.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/modules/auth/*`
- Modify: `apps/api/src/modules/customers/customers.controller.ts`
- Modify: `apps/api/src/modules/customers/customers.service.ts`
- Modify: `apps/api/src/modules/opportunities/*`
- Modify: `apps/api/src/modules/visits/*`
- Modify: `apps/api/src/modules/follow-up-tasks/*`
- Modify: `apps/api/src/modules/orders/*`
- Modify: `apps/api/src/modules/quotes/*`
- Modify: `apps/api/src/modules/billing-requests/*`
- Modify: `apps/api/src/modules/dashboard/*`
- Create: `apps/api/src/modules/reports/*`
- Create: `apps/api/src/modules/calculators/*`
- Create: `apps/api/src/modules/users/*` if user administration is added now

### Frontend files likely to change

- Modify: `apps/web/src/components/sidebar-nav.tsx`
- Modify: `apps/web/src/components/ui/theme.ts`
- Modify: `apps/web/src/app/(app)/customers/[id]/page.tsx`
- Modify: `apps/web/src/app/(app)/customers/page.tsx`
- Modify: `apps/web/src/app/(app)/agenda/page.tsx`
- Modify: `apps/web/src/app/(app)/dashboard/page.tsx`
- Modify: `apps/web/src/app/(app)/orders/[id]/page.tsx`
- Modify: `apps/web/src/app/(app)/orders/page.tsx`
- Modify: `apps/web/src/app/(app)/quotes/[id]/page.tsx`
- Modify: `apps/web/src/app/(app)/visits/[id]/page.tsx`
- Modify: `apps/web/src/app/(app)/follow-ups/[id]/page.tsx`
- Modify: `apps/web/src/lib/auth.ts`
- Modify: `apps/web/src/lib/auth.server.ts`
- Modify: `apps/web/src/lib/api.server.ts`
- Modify: `apps/web/src/lib/api.client.ts`
- Create: `apps/web/src/components/customers/customer-history-section.tsx`
- Create: `apps/web/src/components/customers/customer-related-records.tsx`
- Create: `apps/web/src/components/reports/*`
- Create: `apps/web/src/components/agenda/*` as needed for queue and reminder views
- Create: `apps/web/src/app/(app)/reports/*` if reports get their own route
- Create: `apps/web/src/app/(app)/users/*` if user administration is added now

### Tests likely to change

- Modify: `apps/api/test/customers.e2e-spec.ts`
- Modify: `apps/api/test/auth.e2e-spec.ts`
- Create: `apps/api/test/visits.e2e-spec.ts`
- Create: `apps/api/test/follow-up-tasks.e2e-spec.ts`
- Create: `apps/api/test/orders.e2e-spec.ts`
- Create: `apps/api/test/billing-requests.e2e-spec.ts`
- Create: `apps/api/test/reports.e2e-spec.ts`
- Modify: `apps/web/tests/e2e/customers.spec.ts`
- Create: `apps/web/tests/e2e/agenda.spec.ts`
- Create: `apps/web/tests/e2e/orders.spec.ts`
- Create: `apps/web/tests/e2e/reports.spec.ts`

## Task 1: Customer 360 history

**Outcome:** A user can open a customer and see the full commercial and operational history in one place.

**Files:**

- Modify: `apps/api/src/modules/customers/customers.service.ts`
- Modify: `apps/api/src/modules/customers/customers.controller.ts`
- Modify: `apps/web/src/app/(app)/customers/[id]/page.tsx`
- Create: `apps/web/src/components/customers/customer-history-section.tsx`
- Create: `apps/web/src/components/customers/customer-related-records.tsx`
- Modify: `apps/web/src/app/(app)/customers/page.tsx`
- Test: `apps/api/test/customers.e2e-spec.ts`
- Test: `apps/web/tests/e2e/customers.spec.ts`

- [ ] Extend `CustomersService.findOne()` so it returns:
  - segment
  - contacts
  - opportunities
  - visits
  - follow-up tasks
  - quotes
  - orders
  - billing requests
- [ ] Keep each related collection sorted by the most useful operator order:
  - opportunities by `createdAt desc`
  - visits by `scheduledAt desc`
  - follow-up tasks by `dueAt asc`
  - quotes by `createdAt desc`
  - orders by `createdAt desc`
  - billing requests by `createdAt desc`
- [ ] Add backend coverage that verifies the customer detail payload includes all related collections.
- [ ] Redesign `apps/web/src/app/(app)/customers/[id]/page.tsx` into a customer hub with:
  - summary header
  - contact block
  - opportunity block
  - visit timeline
  - follow-up queue
  - quote list
  - order list
  - billing request list
- [ ] Add quick actions from the customer detail page:
  - create visit
  - create follow-up
  - create quote
  - create order
- [ ] Verify the customer list links cleanly into this 360 page.
- [ ] Run:
  - `pnpm build`
  - `pnpm --filter @norgtech/api test -- customers.e2e-spec.ts`

## Task 2: Business roles and permission matrix

**Outcome:** Access control matches the business areas instead of only `admin` and `comercial`.

**Files:**

- Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/prisma/seed.ts`
- Modify: `apps/api/src/modules/auth/roles.guard.ts`
- Modify: `apps/api/src/modules/auth/jwt.strategy.ts`
- Modify: `apps/api/src/modules/auth/types/authenticated-request.ts`
- Modify: controllers under `apps/api/src/modules/**`
- Modify: `apps/web/src/lib/auth.ts`
- Modify: `apps/web/src/lib/auth.server.ts`
- Modify: `apps/web/src/components/sidebar-nav.tsx`
- Modify: `apps/web/src/components/ui/theme.ts`
- Test: `apps/api/test/auth.e2e-spec.ts`

- [ ] Expand `UserRole` in Prisma to:
  - `administrador`
  - `director_comercial`
  - `comercial`
  - `tecnico`
  - `facturacion`
  - `logistica`
- [ ] Create and apply a migration for the new enum values.
- [ ] Update the auth payload and request typing so all new roles are recognized end to end.
- [ ] Replace hard-coded controller role lists with the approved permission matrix:
  - `administrador`: full access
  - `director_comercial`: read all commercial and dashboard data
  - `comercial`: customer-facing operational modules
  - `tecnico`: visits, follow-ups, reports
  - `facturacion`: billing requests, related read-only customer/order/quote context
  - `logistica`: orders, shipment and delivery updates, related read-only customer context
- [ ] Seed at least one user per role for local verification.
- [ ] Hide or disable navigation entries in the frontend when the logged-in role should not access them.
- [ ] Add auth tests for:
  - successful login with a new role
  - forbidden access to a protected endpoint for the wrong role
  - allowed access to the correct endpoint for the right role
- [ ] Run:
  - `pnpm build`
  - `pnpm --filter @norgtech/api test -- auth.e2e-spec.ts`

## Task 3: Agenda automation and operator queue

**Outcome:** Agenda, visits, and follow-ups behave like an active work queue instead of a passive registry.

**Files:**

- Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/src/modules/visits/visits.service.ts`
- Modify: `apps/api/src/modules/follow-up-tasks/follow-up-tasks.service.ts`
- Modify: `apps/api/src/modules/dashboard/dashboard.service.ts`
- Modify: `apps/web/src/app/(app)/agenda/page.tsx`
- Modify: `apps/web/src/app/(app)/follow-ups/page.tsx`
- Modify: `apps/web/src/app/(app)/visits/page.tsx`
- Create: `apps/web/src/components/agenda/*`
- Test: `apps/api/test/visits.e2e-spec.ts`
- Test: `apps/api/test/follow-up-tasks.e2e-spec.ts`
- Test: `apps/web/tests/e2e/agenda.spec.ts`

- [ ] Add the minimum reminder state needed in Prisma if the current task model is insufficient.
- [ ] Implement backend logic that marks overdue follow-up tasks consistently.
- [ ] Add APIs or query support for:
  - due today
  - overdue
  - assigned to current user
  - scheduled this week
- [ ] Extend the agenda page into three clear operator views:
  - today
  - this week
  - overdue / urgent
- [ ] Add visible urgency labels and sorting so overdue work is never buried under future work.
- [ ] Surface the next operator queue in the dashboard.
- [ ] Keep this phase simple:
  - no map integration
  - no advanced route optimization
  - no external notifications
- [ ] Add tests for:
  - task becomes overdue
  - completed task leaves the pending queue
  - agenda filters return the right records
- [ ] Run:
  - `pnpm build`
  - `pnpm --filter @norgtech/api test -- visits.e2e-spec.ts`
  - `pnpm --filter @norgtech/api test -- follow-up-tasks.e2e-spec.ts`

## Task 4: Orders, billing, and logistics hardening

**Outcome:** Orders and billing requests support the real operational flow after sale closure.

**Files:**

- Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/src/modules/orders/orders.service.ts`
- Modify: `apps/api/src/modules/orders/orders.controller.ts`
- Modify: `apps/api/src/modules/orders/dto/*`
- Modify: `apps/api/src/modules/billing-requests/billing-requests.service.ts`
- Modify: `apps/api/src/modules/billing-requests/billing-requests.controller.ts`
- Modify: `apps/web/src/app/(app)/orders/[id]/page.tsx`
- Modify: `apps/web/src/app/(app)/orders/page.tsx`
- Modify: `apps/web/src/app/(app)/billing-requests/page.tsx`
- Modify: `apps/web/src/components/orders/*`
- Test: `apps/api/test/orders.e2e-spec.ts`
- Test: `apps/api/test/billing-requests.e2e-spec.ts`
- Test: `apps/web/tests/e2e/orders.spec.ts`

- [ ] Decide whether `BillingRequest` stays as the business object for "orden de facturacion" or needs extra fields.
- [ ] Add the minimum missing logistics fields in Prisma, likely:
  - assigned logistics user
  - committed delivery date
  - dispatch date
  - delivery date
  - logistics notes
- [ ] Keep the order status flow strict and auditable:
  - `recibido`
  - `orden_facturacion`
  - `facturado`
  - `despachado`
  - `entregado`
- [ ] Ensure `BillingRequest` can be created from both quote and recurring-direct order flows without ambiguity.
- [ ] Improve the order detail page so it shows:
  - source quote if present
  - billing request history
  - logistics timestamps
  - next valid action
- [ ] Improve the billing requests page so facturation users can act without leaving context.
- [ ] Add audit coverage for every state transition in orders and billing requests.
- [ ] Run:
  - `pnpm build`
  - `pnpm --filter @norgtech/api test -- orders.e2e-spec.ts`
  - `pnpm --filter @norgtech/api test -- billing-requests.e2e-spec.ts`

## Task 5: Executive PDF and calculator integration foundation

**Outcome:** A completed visit can produce a branded executive report using CRM data and future ROI/cost calculation outputs.

**Files:**

- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/src/modules/reports/reports.module.ts`
- Create: `apps/api/src/modules/reports/reports.service.ts`
- Create: `apps/api/src/modules/reports/reports.controller.ts`
- Create: `apps/api/src/modules/reports/dto/*`
- Create: `apps/api/src/modules/calculators/calculators.module.ts`
- Create: `apps/api/src/modules/calculators/calculators.service.ts`
- Modify: `apps/api/src/modules/visits/visits.service.ts`
- Modify: `apps/web/src/app/(app)/visits/[id]/page.tsx`
- Create: `apps/web/src/components/reports/*`
- Create: `apps/web/src/app/(app)/reports/*` if a report view is needed
- Test: `apps/api/test/reports.e2e-spec.ts`
- Test: `apps/web/tests/e2e/reports.spec.ts`

- [ ] Add the minimum report persistence model needed for traceability:
  - report header
  - linked customer
  - linked visit
  - generated payload snapshot
  - file metadata or regeneration token
- [ ] Define a report payload contract with these sections:
  - diagnostico del cliente
  - problemas detectados
  - solucion propuesta
  - costos
  - ROI estimado
  - cotizacion vinculada
- [ ] Implement calculator adapters as an internal service boundary, even if the first version uses mocked or manually entered values.
- [ ] Implement report generation from visit context and customer context.
- [ ] Add a "generate executive report" action to the visit detail page.
- [ ] Keep the first PDF version pragmatic:
  - one branded template
  - server-side generation
  - deterministic payload snapshot
- [ ] Add tests for:
  - report creation from a completed visit
  - invalid report generation from incomplete visit data
  - persistence of the generated report metadata
- [ ] Run:
  - `pnpm build`
  - `pnpm --filter @norgtech/api test -- reports.e2e-spec.ts`

## Verification checklist

- [ ] `pnpm build`
- [ ] `pnpm test`
- [ ] Manual role verification in the UI for each seeded role
- [ ] Manual customer 360 review using seeded linked records
- [ ] Manual order flow review from quote to billing request to delivery
- [ ] Manual visit-to-report review after completing a visit

## Risks and sequencing notes

- Roles should land before wider UI exposure of billing and logistics actions, otherwise restricted flows will leak.
- Customer 360 should land before PDF work, otherwise the report layer will be built on incomplete customer context.
- Agenda automation should stay internal and simple for this pass; do not block the MVP on email, SMS, or external schedulers.
- Calculator integration should be built behind adapters so the current CRM is not tightly coupled to legacy HTML tools.

## Recommended execution waves

### Wave 1

- Task 1
- Task 2

### Wave 2

- Task 3
- Task 4

### Wave 3

- Task 5

