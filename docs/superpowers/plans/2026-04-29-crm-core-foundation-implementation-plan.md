# CRM Core Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 1 foundation for the CRM web platform: monorepo scaffolding, auth, roles, users, customer segments, customers, contacts, and opportunities with audited state transitions.

**Architecture:** Use a pnpm workspace monorepo with `apps/web` for Next.js, `apps/api` for Nest.js, and `packages/shared` for cross-app types. Keep all business rules, role enforcement, pipeline transitions, and audit generation in the Nest.js backend while the Next.js app stays as an authenticated operator panel.

**Tech Stack:** pnpm workspaces, Next.js App Router, Nest.js, PostgreSQL, Prisma ORM, NextAuth or JWT session bridge, Zod, React Hook Form, Tailwind CSS, Vitest/Jest, Playwright, ESLint, TypeScript

---

## Plan decomposition

This spec is too large for one implementation pass. Split execution into these plans:

1. This plan: foundation, auth, users, segments, customers, contacts, opportunities, audit base
2. Agenda plan: visits, follow-up tasks, reminders, weekly agenda views
3. Commerce plan: products, quotes, quote items, billing requests from quotes
4. Orders plan: orders, order items, billing requests from orders
5. Dashboard plan: aggregate KPIs and initial panel summaries

Only execute this first plan before opening the next one.

## File map

### Workspace and tooling

- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `apps/web/package.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/app/login/page.tsx`
- Create: `apps/web/src/app/(app)/dashboard/page.tsx`
- Create: `apps/web/src/app/(app)/customers/page.tsx`
- Create: `apps/web/src/app/(app)/opportunities/page.tsx`
- Create: `apps/web/src/middleware.ts`
- Create: `apps/web/src/lib/auth.ts`
- Create: `apps/web/src/lib/api.ts`
- Create: `apps/web/src/components/forms/*`
- Create: `apps/api/package.json`
- Create: `apps/api/nest-cli.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/app.module.ts`
- Create: `apps/api/src/config/*`
- Create: `apps/api/src/prisma/*`
- Create: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/seed.ts`
- Create: `packages/shared/package.json`
- Create: `packages/shared/src/index.ts`

### Backend domain modules

- Create: `apps/api/src/modules/auth/*`
- Create: `apps/api/src/modules/users/*`
- Create: `apps/api/src/modules/customer-segments/*`
- Create: `apps/api/src/modules/customers/*`
- Create: `apps/api/src/modules/contacts/*`
- Create: `apps/api/src/modules/opportunities/*`
- Create: `apps/api/src/modules/audit/*`
- Create: `apps/api/test/*`

### Frontend app domain

- Create: `apps/web/src/app/(app)/layout.tsx`
- Create: `apps/web/src/app/(app)/customers/new/page.tsx`
- Create: `apps/web/src/app/(app)/customers/[id]/page.tsx`
- Create: `apps/web/src/app/(app)/opportunities/new/page.tsx`
- Create: `apps/web/src/app/(app)/opportunities/[id]/page.tsx`
- Create: `apps/web/src/components/layout/*`
- Create: `apps/web/src/components/customers/*`
- Create: `apps/web/src/components/opportunities/*`
- Create: `apps/web/src/components/segments/*`
- Create: `apps/web/tests/e2e/auth.spec.ts`
- Create: `apps/web/tests/e2e/customers.spec.ts`

## Task 1: Scaffold the monorepo and shared tooling

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `apps/web/package.json`
- Create: `apps/api/package.json`
- Create: `packages/shared/package.json`
- Create: `packages/shared/src/index.ts`

- [ ] **Step 1: Write the failing workspace smoke test**

```ts
// packages/shared/src/index.test.ts
import { describe, expect, it } from "vitest";
import { appName } from "./index";

describe("shared workspace package", () => {
  it("exports the app name constant", () => {
    expect(appName).toBe("norgtech-crm");
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @norgtech/shared test`
Expected: FAIL because workspace files and test runner do not exist yet

- [ ] **Step 3: Write minimal workspace implementation**

```json
// package.json
{
  "name": "norgtech-crm",
  "private": true,
  "packageManager": "pnpm@10",
  "scripts": {
    "build": "pnpm -r build",
    "dev": "pnpm --parallel --filter @norgtech/api --filter @norgtech/web dev",
    "lint": "pnpm -r lint",
    "test": "pnpm -r test"
  }
}
```

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
```

```json
// packages/shared/package.json
{
  "name": "@norgtech/shared",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "vitest": "^3.2.0"
  }
}
```

```ts
// packages/shared/src/index.ts
export const appName = "norgtech-crm";

export type UserRole = "admin" | "comercial";
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @norgtech/shared test`
Expected: PASS with 1 test passed

- [x] **Step 5: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .gitignore packages/shared
git commit -m "chore: scaffold monorepo workspace"
```

## Task 2: Scaffold Nest.js app, Prisma, and database schema baseline

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/nest-cli.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/app.module.ts`
- Create: `apps/api/src/prisma/prisma.module.ts`
- Create: `apps/api/src/prisma/prisma.service.ts`
- Create: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/seed.ts`
- Test: `apps/api/test/app.e2e-spec.ts`

- [ ] **Step 1: Write the failing API health test**

```ts
// apps/api/test/app.e2e-spec.ts
import request from "supertest";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { AppModule } from "../src/app.module";

describe("API health", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health returns ok", async () => {
    await request(app.getHttpServer())
      .get("/health")
      .expect(200)
      .expect({ status: "ok" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @norgtech/api test -- app.e2e-spec.ts`
Expected: FAIL because the Nest app does not exist yet

- [ ] **Step 3: Write minimal API and Prisma implementation**

```prisma
// apps/api/prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum UserRole {
  admin
  comercial
}

model User {
  id           String   @id @default(cuid())
  name         String
  email        String   @unique
  passwordHash String
  role         UserRole
  active       Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

```ts
// apps/api/src/app.module.ts
import { Module } from "@nestjs/common";
import { PrismaModule } from "./prisma/prisma.module";
import { HealthController } from "./health.controller";

@Module({
  imports: [PrismaModule],
  controllers: [HealthController],
})
export class AppModule {}
```

```ts
// apps/api/src/health.controller.ts
import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  getHealth() {
    return { status: "ok" };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @norgtech/api test -- app.e2e-spec.ts`
Expected: PASS with `GET /health returns ok`

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat: scaffold Nest API and Prisma baseline"
```

## Task 3: Implement authentication, roles, and seeded admin user

**Files:**
- Create: `apps/api/src/modules/auth/auth.module.ts`
- Create: `apps/api/src/modules/auth/auth.controller.ts`
- Create: `apps/api/src/modules/auth/auth.service.ts`
- Create: `apps/api/src/modules/auth/jwt.strategy.ts`
- Create: `apps/api/src/modules/auth/roles.guard.ts`
- Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/prisma/seed.ts`
- Test: `apps/api/test/auth.e2e-spec.ts`

- [ ] **Step 1: Write the failing auth test**

```ts
// apps/api/test/auth.e2e-spec.ts
import request from "supertest";

describe("Auth", () => {
  it("POST /auth/login returns a bearer token for seeded admin", async () => {
    const response = await request(globalThis.__APP__)
      .post("/auth/login")
      .send({ email: "admin@norgtech.local", password: "Admin123*" })
      .expect(200);

    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.user.role).toBe("admin");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @norgtech/api test -- auth.e2e-spec.ts`
Expected: FAIL with `Cannot POST /auth/login`

- [ ] **Step 3: Write minimal auth implementation**

```prisma
// add to apps/api/prisma/schema.prisma
model AuditLog {
  id            String   @id @default(cuid())
  entityType    String
  entityId      String
  action        String
  previousState Json?
  nextState     Json?
  actorUserId   String
  createdAt     DateTime @default(now())
}
```

```ts
// apps/api/src/modules/auth/auth.service.ts
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException("Invalid credentials");
    }

    return {
      accessToken: await this.jwt.signAsync({
        sub: user.id,
        role: user.role,
        email: user.email,
      }),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }
}
```

```ts
// apps/api/prisma/seed.ts
await prisma.user.upsert({
  where: { email: "admin@norgtech.local" },
  update: {},
  create: {
    name: "Admin",
    email: "admin@norgtech.local",
    passwordHash: await bcrypt.hash("Admin123*", 10),
    role: "admin",
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @norgtech/api test -- auth.e2e-spec.ts`
Expected: PASS and response contains `accessToken`

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat: add auth and role-based access"
```

## Task 4: Implement customer segments module with admin-only CRUD

**Files:**
- Create: `apps/api/src/modules/customer-segments/*`
- Modify: `apps/api/prisma/schema.prisma`
- Test: `apps/api/test/customer-segments.e2e-spec.ts`
- Create: `apps/web/src/app/(app)/segments/page.tsx`

- [ ] **Step 1: Write the failing customer segment test**

```ts
// apps/api/test/customer-segments.e2e-spec.ts
import request from "supertest";

describe("Customer segments", () => {
  it("allows an admin to create a segment", async () => {
    await request(globalThis.__APP__)
      .post("/customer-segments")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ name: "Oro", description: "Clientes de alto valor" })
      .expect(201);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @norgtech/api test -- customer-segments.e2e-spec.ts`
Expected: FAIL because route and schema do not exist

- [ ] **Step 3: Write minimal segment implementation**

```prisma
model CustomerSegment {
  id          String   @id @default(cuid())
  name        String   @unique
  description String?
  active      Boolean  @default(true)
  createdBy   String
  updatedBy   String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

```ts
// apps/api/src/modules/customer-segments/dto/create-customer-segment.dto.ts
import { IsOptional, IsString, MinLength } from "class-validator";

export class CreateCustomerSegmentDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;
}
```

```ts
// apps/api/src/modules/customer-segments/customer-segments.controller.ts
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
@Post()
create(@CurrentUser() user: AuthUser, @Body() dto: CreateCustomerSegmentDto) {
  return this.customerSegmentsService.create(user, dto);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @norgtech/api test -- customer-segments.e2e-spec.ts`
Expected: PASS with 201 created

- [ ] **Step 5: Commit**

```bash
git add apps/api apps/web/src/app/(app)/segments
git commit -m "feat: add admin-managed customer segments"
```

## Task 5: Implement customers and contacts with audit logging

**Files:**
- Create: `apps/api/src/modules/customers/*`
- Create: `apps/api/src/modules/contacts/*`
- Create: `apps/api/src/modules/audit/*`
- Modify: `apps/api/prisma/schema.prisma`
- Test: `apps/api/test/customers.e2e-spec.ts`
- Create: `apps/web/src/app/(app)/customers/page.tsx`
- Create: `apps/web/src/app/(app)/customers/new/page.tsx`
- Create: `apps/web/src/app/(app)/customers/[id]/page.tsx`

- [ ] **Step 1: Write the failing customer creation test**

```ts
// apps/api/test/customers.e2e-spec.ts
import request from "supertest";

describe("Customers", () => {
  it("creates a customer and a primary contact and records audit", async () => {
    const createResponse = await request(globalThis.__APP__)
      .post("/customers")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        legalName: "Agropecuaria Norte SAS",
        displayName: "Agro Norte",
        taxId: "900123456",
        segmentId: globalThis.__SEGMENT_ID__,
        contacts: [
          {
            fullName: "Carlos Perez",
            roleTitle: "Compras",
            phone: "3000000000",
            email: "carlos@agronorte.co",
            isPrimary: true
          }
        ]
      })
      .expect(201);

    expect(createResponse.body.contacts).toHaveLength(1);

    const auditResponse = await request(globalThis.__APP__)
      .get(`/audit?entityType=Customer&entityId=${createResponse.body.id}`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(200);

    expect(auditResponse.body[0].action).toBe("customer.created");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @norgtech/api test -- customers.e2e-spec.ts`
Expected: FAIL because customers, contacts, and audit modules do not exist

- [ ] **Step 3: Write minimal implementation for customers, contacts, and audit**

```prisma
model Customer {
  id               String    @id @default(cuid())
  legalName        String
  displayName      String
  taxId            String?   @unique
  phone            String?
  email            String?
  address          String?
  city             String?
  department       String?
  notes            String?
  segmentId        String
  assignedToUserId String?
  active           Boolean   @default(true)
  createdBy        String
  updatedBy        String
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
  contacts         Contact[]
}

model Contact {
  id         String   @id @default(cuid())
  customerId String
  fullName   String
  roleTitle  String?
  phone      String?
  email      String?
  isPrimary  Boolean  @default(false)
  notes      String?
  createdBy  String
  updatedBy  String
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  customer   Customer @relation(fields: [customerId], references: [id])
}
```

```ts
// apps/api/src/modules/audit/audit.service.ts
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(input: {
    entityType: string;
    entityId: string;
    action: string;
    actorUserId: string;
    previousState?: unknown;
    nextState?: unknown;
  }) {
    return this.prisma.auditLog.create({ data: input });
  }
}
```

```ts
// apps/api/src/modules/customers/customers.service.ts
async create(user: AuthUser, dto: CreateCustomerDto) {
  const customer = await this.prisma.customer.create({
    data: {
      legalName: dto.legalName,
      displayName: dto.displayName,
      taxId: dto.taxId,
      segmentId: dto.segmentId,
      createdBy: user.id,
      updatedBy: user.id,
      contacts: {
        create: dto.contacts.map((contact) => ({
          ...contact,
          createdBy: user.id,
          updatedBy: user.id,
        })),
      },
    },
    include: { contacts: true },
  });

  await this.auditService.record({
    entityType: "Customer",
    entityId: customer.id,
    action: "customer.created",
    actorUserId: user.id,
    nextState: customer,
  });

  return customer;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @norgtech/api test -- customers.e2e-spec.ts`
Expected: PASS and audit query returns `customer.created`

- [ ] **Step 5: Commit**

```bash
git add apps/api apps/web/src/app/(app)/customers
git commit -m "feat: add customers, contacts, and audit logging"
```

## Task 6: Implement opportunities with controlled pipeline transitions

**Files:**
- Create: `apps/api/src/modules/opportunities/*`
- Modify: `apps/api/prisma/schema.prisma`
- Test: `apps/api/test/opportunities.e2e-spec.ts`
- Create: `apps/web/src/app/(app)/opportunities/page.tsx`
- Create: `apps/web/src/app/(app)/opportunities/new/page.tsx`
- Create: `apps/web/src/app/(app)/opportunities/[id]/page.tsx`

- [ ] **Step 1: Write the failing pipeline transition test**

```ts
// apps/api/test/opportunities.e2e-spec.ts
import request from "supertest";

describe("Opportunities", () => {
  it("allows valid pipeline transitions and rejects invalid ones", async () => {
    const created = await request(globalThis.__APP__)
      .post("/opportunities")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        customerId: globalThis.__CUSTOMER_ID__,
        title: "Proyecto nutricion bovina",
        stage: "prospecto",
        estimatedValue: 15000000
      })
      .expect(201);

    await request(globalThis.__APP__)
      .patch(`/opportunities/${created.body.id}/stage`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ stage: "contacto" })
      .expect(200);

    await request(globalThis.__APP__)
      .patch(`/opportunities/${created.body.id}/stage`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ stage: "venta_cerrada" })
      .expect(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @norgtech/api test -- opportunities.e2e-spec.ts`
Expected: FAIL because opportunities module and transition rules do not exist

- [ ] **Step 3: Write minimal opportunity and transition implementation**

```prisma
enum OpportunityStage {
  prospecto
  contacto
  visita
  cotizacion
  negociacion
  orden_facturacion
  venta_cerrada
  perdida
}

model Opportunity {
  id               String           @id @default(cuid())
  customerId       String
  title            String
  description      String?
  stage            OpportunityStage
  estimatedValue   Decimal?         @db.Decimal(14, 2)
  expectedCloseDate DateTime?
  assignedToUserId String?
  lostReason       String?
  closedAt         DateTime?
  createdBy        String
  updatedBy        String
  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt
}
```

```ts
// apps/api/src/modules/opportunities/opportunity-stage.machine.ts
export const allowedTransitions: Record<string, string[]> = {
  prospecto: ["contacto", "perdida"],
  contacto: ["visita", "perdida"],
  visita: ["cotizacion", "perdida"],
  cotizacion: ["negociacion", "perdida"],
  negociacion: ["orden_facturacion", "perdida"],
  orden_facturacion: ["venta_cerrada", "perdida"],
  venta_cerrada: [],
  perdida: [],
};
```

```ts
// apps/api/src/modules/opportunities/opportunities.service.ts
if (!allowedTransitions[current.stage].includes(dto.stage)) {
  throw new BadRequestException("Invalid opportunity stage transition");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @norgtech/api test -- opportunities.e2e-spec.ts`
Expected: PASS with one valid transition and one rejected invalid transition

- [ ] **Step 5: Commit**

```bash
git add apps/api apps/web/src/app/(app)/opportunities
git commit -m "feat: add opportunities with audited stage transitions"
```

## Task 7: Scaffold Next.js app with auth gate and CRM list views

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/app/login/page.tsx`
- Create: `apps/web/src/app/(app)/layout.tsx`
- Create: `apps/web/src/app/(app)/dashboard/page.tsx`
- Create: `apps/web/src/app/(app)/customers/page.tsx`
- Create: `apps/web/src/app/(app)/opportunities/page.tsx`
- Create: `apps/web/src/middleware.ts`
- Create: `apps/web/src/lib/auth.ts`
- Create: `apps/web/src/lib/api.ts`
- Test: `apps/web/tests/e2e/auth.spec.ts`

- [ ] **Step 1: Write the failing frontend auth flow test**

```ts
// apps/web/tests/e2e/auth.spec.ts
import { test, expect } from "@playwright/test";

test("redirects unauthenticated users to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @norgtech/web test:e2e -- auth.spec.ts`
Expected: FAIL because the Next app and Playwright config do not exist

- [ ] **Step 3: Write minimal Next app implementation**

```tsx
// apps/web/src/middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const token = request.cookies.get("session_token")?.value;
  if (!token && request.nextUrl.pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}
```

```tsx
// apps/web/src/app/login/page.tsx
export default function LoginPage() {
  return (
    <main>
      <h1>Ingresar</h1>
      <form>{/* login form bound to /auth/login */}</form>
    </main>
  );
}
```

```tsx
// apps/web/src/app/(app)/dashboard/page.tsx
export default function DashboardPage() {
  return <main>Dashboard CRM</main>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @norgtech/web test:e2e -- auth.spec.ts`
Expected: PASS and unauthenticated route redirects to `/login`

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat: scaffold Next CRM shell with auth gate"
```

## Task 8: Add customer and opportunity CRUD screens wired to the API

**Files:**
- Modify: `apps/web/src/app/(app)/customers/page.tsx`
- Modify: `apps/web/src/app/(app)/customers/new/page.tsx`
- Modify: `apps/web/src/app/(app)/customers/[id]/page.tsx`
- Modify: `apps/web/src/app/(app)/opportunities/page.tsx`
- Modify: `apps/web/src/app/(app)/opportunities/new/page.tsx`
- Modify: `apps/web/src/app/(app)/opportunities/[id]/page.tsx`
- Create: `apps/web/src/components/customers/customer-form.tsx`
- Create: `apps/web/src/components/opportunities/opportunity-form.tsx`
- Test: `apps/web/tests/e2e/customers.spec.ts`

- [x] **Step 1: Write the failing customer create UI test**

```ts
// apps/web/tests/e2e/customers.spec.ts
import { test, expect } from "@playwright/test";

test("an authenticated user can create a customer", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo").fill("admin@norgtech.local");
  await page.getByLabel("Contrasena").fill("Admin123*");
  await page.getByRole("button", { name: "Ingresar" }).click();

  await page.goto("/customers/new");
  await page.getByLabel("Razon social").fill("Agropecuaria Norte SAS");
  await page.getByLabel("Nombre comercial").fill("Agro Norte");
  await page.getByRole("button", { name: "Guardar cliente" }).click();

  await expect(page.getByText("Agro Norte")).toBeVisible();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @norgtech/web test:e2e -- customers.spec.ts`
Expected: FAIL because forms and API integration are not implemented

- [x] **Step 3: Write minimal UI implementation**

```tsx
// apps/web/src/components/customers/customer-form.tsx
"use client";

import { useForm } from "react-hook-form";

export function CustomerForm() {
  const { register, handleSubmit } = useForm();

  return (
    <form onSubmit={handleSubmit(async (values) => await fetch("/api/customers", { method: "POST", body: JSON.stringify(values) }))}>
      <label>
        Razon social
        <input {...register("legalName")} aria-label="Razon social" />
      </label>
      <label>
        Nombre comercial
        <input {...register("displayName")} aria-label="Nombre comercial" />
      </label>
      <button type="submit">Guardar cliente</button>
    </form>
  );
}
```

```tsx
// apps/web/src/app/(app)/customers/new/page.tsx
import { CustomerForm } from "@/components/customers/customer-form";

export default function NewCustomerPage() {
  return (
    <main>
      <h1>Nuevo cliente</h1>
      <CustomerForm />
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @norgtech/web test:e2e -- customers.spec.ts`
Expected: PASS and the saved customer appears in the UI

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat: add CRM customer and opportunity screens"
```

## Verification checklist for this plan

- Backend starts and serves `/health`
- Seed creates initial admin user
- Login returns JWT and role payload
- Admin can manage customer segments
- Admin and comerciales can manage customers and contacts
- Opportunities enforce valid stage transitions
- Audit entries are written for create and transition events
- Frontend redirects unauthenticated users to `/login`
- Frontend can list and create customers
- Frontend can list and create opportunities

## Self-review

Spec coverage checked against this plan:

- Included: auth, roles, users, segments, customers, contacts, opportunities, audit base
- Explicitly deferred to next plans: agenda, products, quotes, orders, billing requests, dashboard aggregates

Placeholder scan:

- No `TBD`, `TODO`, or deferred implementation markers inside tasks
- Each task includes exact files, test commands, and commit commands

Type consistency:

- Roles remain `admin | comercial`
- Core entities match the approved spec naming: `Customer`, `Contact`, `Opportunity`, `CustomerSegment`, `AuditLog`

