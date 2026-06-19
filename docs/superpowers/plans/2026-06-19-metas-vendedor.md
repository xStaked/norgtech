# Metas Comerciales por Vendedor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build seller-level commercial goals with API, progress calculations, dashboard visibility, management UI, and regression tests.

**Architecture:** Add a focused Nest module `seller-goals` backed by a new Prisma `SellerGoal` model related to `User`. Progress is calculated from `Order.total` for orders whose customer is assigned to the seller. The dashboard consumes a new aggregate endpoint, while `/users` gets a compact management panel for creating and editing goals.

**Tech Stack:** NestJS, Prisma, PostgreSQL, Jest/Supertest e2e tests, Next.js App Router, React client components, existing UI components.

---

## File Structure

- Create `apps/api/prisma/migrations/20260619120000_seller_goals/migration.sql`: SQL migration for `SellerGoal`.
- Modify `apps/api/prisma/schema.prisma`: add `SellerGoal` and `User.sellerGoals`.
- Create `apps/api/src/modules/seller-goals/dto/create-seller-goal.dto.ts`: validated create DTO.
- Create `apps/api/src/modules/seller-goals/dto/update-seller-goal.dto.ts`: partial update DTO.
- Create `apps/api/src/modules/seller-goals/seller-goals.service.ts`: CRUD, permissions, period parsing, progress calculation.
- Create `apps/api/src/modules/seller-goals/seller-goals.controller.ts`: `/users/:id/seller-goals` routes.
- Create `apps/api/src/modules/seller-goals/seller-goals.module.ts`: module wiring.
- Modify `apps/api/src/app.module.ts`: import `SellerGoalsModule`.
- Modify `apps/api/src/modules/dashboard/dashboard.controller.ts`: add `GET /dashboard/seller-goals`.
- Modify `apps/api/src/modules/dashboard/dashboard.module.ts`: import `SellerGoalsModule`.
- Create `apps/api/test/seller-goals.e2e-spec.ts`: API regression tests.
- Create `apps/web/src/components/dashboard/seller-goals-dashboard.tsx`: dashboard block.
- Modify `apps/web/src/app/(app)/dashboard/page.tsx`: fetch and render seller goals with `companyId`.
- Create `apps/web/src/components/users/seller-goals-manager.tsx`: goal management client component.
- Modify `apps/web/src/components/users/user-management-client.tsx`: include manager for seller roles.
- Modify `apps/web/src/components/users/types.ts`: include any role/user type reuse if needed.
- Create or modify `apps/web/tests/e2e/seller-goals.spec.ts`: lightweight UI coverage if existing Playwright setup can seed or intercept data.

---

## Task 1: Data Model and Migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260619120000_seller_goals/migration.sql`

- [ ] **Step 1: Add Prisma model**

In `apps/api/prisma/schema.prisma`, add relation on `User` near existing relations:

```prisma
  sellerGoals                   SellerGoal[]
```

Add model near `CustomerGoal`:

```prisma
model SellerGoal {
  id           String   @id @default(cuid())
  userId       String
  periodType   String
  periodValue  String
  targetAmount Decimal  @db.Decimal(14, 2)
  notes        String?
  createdBy    String
  updatedBy    String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, periodType, periodValue])
  @@index([periodType, periodValue])
}
```

- [ ] **Step 2: Add SQL migration**

Create `apps/api/prisma/migrations/20260619120000_seller_goals/migration.sql`:

```sql
-- CreateTable
CREATE TABLE "SellerGoal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodType" TEXT NOT NULL,
    "periodValue" TEXT NOT NULL,
    "targetAmount" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerGoal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SellerGoal_userId_periodType_periodValue_key" ON "SellerGoal"("userId", "periodType", "periodValue");

-- CreateIndex
CREATE INDEX "SellerGoal_periodType_periodValue_idx" ON "SellerGoal"("periodType", "periodValue");

-- AddForeignKey
ALTER TABLE "SellerGoal" ADD CONSTRAINT "SellerGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Validate Prisma schema**

Run: `pnpm --filter @norgtech/api prisma validate`

Expected: schema validates successfully.

- [ ] **Step 4: Commit data model**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260619120000_seller_goals/migration.sql
git commit -m "feat: add seller goals data model"
```

---

## Task 2: Seller Goals API with TDD

**Files:**
- Create: `apps/api/test/seller-goals.e2e-spec.ts`
- Create: `apps/api/src/modules/seller-goals/dto/create-seller-goal.dto.ts`
- Create: `apps/api/src/modules/seller-goals/dto/update-seller-goal.dto.ts`
- Create: `apps/api/src/modules/seller-goals/seller-goals.service.ts`
- Create: `apps/api/src/modules/seller-goals/seller-goals.controller.ts`
- Create: `apps/api/src/modules/seller-goals/seller-goals.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write failing API tests**

Create `apps/api/test/seller-goals.e2e-spec.ts` with tests for:

```ts
it("creates a monthly goal for an eligible seller", async () => {
  const response = await request(globalThis.__APP__)
    .post("/users/seller-user-id/seller-goals")
    .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
    .send({
      periodType: "mensual",
      periodValue: "2026-06",
      targetAmount: 300000000,
      notes: "Meta junio",
    })
    .expect(201);

  expect(response.body.userId).toBe("seller-user-id");
  expect(response.body.periodType).toBe("mensual");
  expect(response.body.periodValue).toBe("2026-06");
  expect(Number(response.body.targetAmount)).toBe(300000000);
});

it("rejects duplicate goals for the same seller and period", async () => {
  await request(globalThis.__APP__)
    .post("/users/seller-user-id/seller-goals")
    .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
    .send({ periodType: "mensual", periodValue: "2026-07", targetAmount: 200000000 })
    .expect(201);

  await request(globalThis.__APP__)
    .post("/users/seller-user-id/seller-goals")
    .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
    .send({ periodType: "mensual", periodValue: "2026-07", targetAmount: 250000000 })
    .expect(409);
});

it("calculates progress from orders for customers assigned to the seller", async () => {
  const response = await request(globalThis.__APP__)
    .get("/users/seller-user-id/seller-goals/progress?periodType=mensual&periodValue=2026-06")
    .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
    .expect(200);

  expect(response.body.soldAmount).toBe(120000000);
  expect(response.body.ordersCount).toBe(2);
  expect(response.body.customersCount).toBe(1);
  expect(response.body.percentage).toBe(40);
});
```

Stub `PrismaService` in the same style as `apps/api/test/customer-goals.e2e-spec.ts`. Include users `admin-user-id`, `seller-user-id`, `other-seller-id`, `billing-user-id`; customers assigned to seller and other seller; orders with `orderDate`, `status`, `companyId`, `total`, and nested customer assignment filtering.

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm --filter @norgtech/api test -- seller-goals.e2e-spec.ts`

Expected: FAIL because `SellerGoalsModule` and `/users/:id/seller-goals` routes do not exist.

- [ ] **Step 3: Add DTOs**

Create `apps/api/src/modules/seller-goals/dto/create-seller-goal.dto.ts`:

```ts
import { Type } from "class-transformer";
import { IsIn, IsNumber, IsOptional, IsString, Matches, MaxLength, Min, ValidateIf } from "class-validator";

export class CreateSellerGoalDto {
  @IsIn(["mensual", "trimestral", "anual"])
  periodType!: string;

  @IsString()
  @ValidateIf((dto: CreateSellerGoalDto) => dto.periodType === "mensual")
  @Matches(/^\d{4}-\d{2}$/)
  periodValue!: string;

  @IsNumber()
  @Min(1)
  @Type(() => Number)
  targetAmount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
```

Then adjust validation in service for quarterly/yearly formats because `class-validator` conditional decorators on one field cannot express all variants cleanly.

Create `apps/api/src/modules/seller-goals/dto/update-seller-goal.dto.ts`:

```ts
import { PartialType } from "@nestjs/mapped-types";
import { CreateSellerGoalDto } from "./create-seller-goal.dto";

export class UpdateSellerGoalDto extends PartialType(CreateSellerGoalDto) {}
```

- [ ] **Step 4: Add service**

Create `apps/api/src/modules/seller-goals/seller-goals.service.ts` with:

```ts
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { OrderStatus, Prisma, UserRole } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthUser } from "../auth/types/authenticated-request";
import { CreateSellerGoalDto } from "./dto/create-seller-goal.dto";
import { UpdateSellerGoalDto } from "./dto/update-seller-goal.dto";

const SELLER_ROLES: UserRole[] = [UserRole.comercial, UserRole.director_comercial];
const PROGRESS_STATUSES: OrderStatus[] = [
  OrderStatus.facturado,
  OrderStatus.despachado,
  OrderStatus.en_transito,
  OrderStatus.entregado,
];

@Injectable()
export class SellerGoalsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(actor: AuthUser, userId: string, dto: CreateSellerGoalDto) {
    this.assertCanWrite(actor);
    this.assertPeriod(dto.periodType, dto.periodValue);
    await this.assertEligibleSeller(userId);
    await this.assertNoDuplicate(userId, dto.periodType, dto.periodValue);

    return this.prisma.sellerGoal.create({
      data: {
        userId,
        periodType: dto.periodType,
        periodValue: dto.periodValue.toUpperCase(),
        targetAmount: new Prisma.Decimal(dto.targetAmount),
        notes: dto.notes || null,
        createdBy: actor.id,
        updatedBy: actor.id,
      },
    });
  }

  async findAll(actor: AuthUser, userId: string) {
    this.assertCanReadUser(actor, userId);
    return this.prisma.sellerGoal.findMany({
      where: { userId },
      orderBy: [{ periodValue: "desc" }, { createdAt: "desc" }],
    });
  }

  async update(actor: AuthUser, userId: string, goalId: string, dto: UpdateSellerGoalDto) {
    this.assertCanWrite(actor);
    const goal = await this.findGoalForUser(userId, goalId);
    const nextPeriodType = dto.periodType ?? goal.periodType;
    const nextPeriodValue = (dto.periodValue ?? goal.periodValue).toUpperCase();
    this.assertPeriod(nextPeriodType, nextPeriodValue);
    if (nextPeriodType !== goal.periodType || nextPeriodValue !== goal.periodValue) {
      await this.assertNoDuplicate(userId, nextPeriodType, nextPeriodValue, goalId);
    }

    return this.prisma.sellerGoal.update({
      where: { id: goalId },
      data: {
        ...(dto.periodType !== undefined ? { periodType: nextPeriodType } : {}),
        ...(dto.periodValue !== undefined ? { periodValue: nextPeriodValue } : {}),
        ...(dto.targetAmount !== undefined ? { targetAmount: new Prisma.Decimal(dto.targetAmount) } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes || null } : {}),
        updatedBy: actor.id,
      },
    });
  }

  async remove(actor: AuthUser, userId: string, goalId: string) {
    this.assertCanWrite(actor);
    await this.findGoalForUser(userId, goalId);
    return this.prisma.sellerGoal.delete({ where: { id: goalId } });
  }

  async getProgress(actor: AuthUser, userId: string, periodType?: string, periodValue?: string, companyId?: string) {
    this.assertCanReadUser(actor, userId);
    const goal = await this.resolveGoal(userId, periodType, periodValue);
    return this.buildProgress(goal, companyId);
  }

  async getDashboard(actor: AuthUser, periodType?: string, periodValue?: string, companyId?: string) {
    if (![UserRole.administrador, UserRole.director_comercial].includes(actor.role)) {
      throw new ForbiddenException("Only control roles can view seller goal dashboard");
    }
    const normalized = this.normalizeDashboardPeriod(periodType, periodValue);
    const goals = await this.prisma.sellerGoal.findMany({
      where: normalized,
      include: { user: { select: { id: true, name: true, active: true, role: true } } },
      orderBy: { periodValue: "desc" },
    });
    const items = await Promise.all(goals.map((goal) => this.buildProgress(goal, companyId)));
    const targetAmount = items.reduce((sum, item) => sum + item.targetAmount, 0);
    const soldAmount = items.reduce((sum, item) => sum + item.soldAmount, 0);
    return {
      ...normalized,
      companyId: companyId ?? null,
      totals: {
        targetAmount,
        soldAmount,
        percentage: targetAmount > 0 ? Number(((soldAmount / targetAmount) * 100).toFixed(2)) : 0,
        remainingAmount: Math.max(0, targetAmount - soldAmount),
        sellers: items.length,
      },
      items: items.sort((a, b) => b.percentage - a.percentage),
    };
  }

  private async buildProgress(goal: any, companyId?: string) {
    const { start, end } = this.getPeriodRange(goal.periodType, goal.periodValue);
    const orders = await this.prisma.order.findMany({
      where: {
        status: { in: PROGRESS_STATUSES },
        orderDate: { gte: start, lte: end },
        ...(companyId ? { companyId } : {}),
        customer: { assignedToUserId: goal.userId },
      },
      select: { id: true, customerId: true, total: true },
    });
    const soldAmount = orders.reduce((sum, order) => sum + Number(order.total), 0);
    const targetAmount = Number(goal.targetAmount);
    return {
      userId: goal.userId,
      sellerName: goal.user?.name ?? "",
      periodType: goal.periodType,
      periodValue: goal.periodValue,
      targetAmount,
      soldAmount,
      percentage: targetAmount > 0 ? Number(((soldAmount / targetAmount) * 100).toFixed(2)) : 0,
      remainingAmount: Math.max(0, targetAmount - soldAmount),
      ordersCount: orders.length,
      customersCount: new Set(orders.map((order) => order.customerId)).size,
      companyId: companyId ?? null,
    };
  }

  private async assertEligibleSeller(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.active || !SELLER_ROLES.includes(user.role)) {
      throw new BadRequestException("User is not an active seller");
    }
  }

  private assertCanWrite(actor: AuthUser) {
    if (![UserRole.administrador, UserRole.director_comercial].includes(actor.role)) {
      throw new ForbiddenException("Only commercial leadership can manage seller goals");
    }
  }

  private assertCanReadUser(actor: AuthUser, userId: string) {
    if ([UserRole.administrador, UserRole.director_comercial].includes(actor.role)) return;
    if (actor.id === userId) return;
    throw new ForbiddenException("You cannot view this seller goal");
  }

  private assertPeriod(periodType: string, periodValue: string) {
    this.getPeriodRange(periodType, periodValue.toUpperCase());
  }

  private getPeriodRange(periodType: string, periodValue: string) {
    if (periodType === "anual") {
      if (!/^\d{4}$/.test(periodValue)) throw new BadRequestException("Invalid anual periodValue");
      const year = Number(periodValue);
      return { start: new Date(year, 0, 1), end: new Date(year, 11, 31, 23, 59, 59, 999) };
    }
    if (periodType === "trimestral") {
      const match = periodValue.match(/^(\d{4})-Q([1-4])$/);
      if (!match) throw new BadRequestException("Invalid trimestral periodValue");
      const year = Number(match[1]);
      const startMonth = (Number(match[2]) - 1) * 3;
      return { start: new Date(year, startMonth, 1), end: new Date(year, startMonth + 3, 0, 23, 59, 59, 999) };
    }
    if (periodType === "mensual") {
      const match = periodValue.match(/^(\d{4})-(\d{2})$/);
      if (!match) throw new BadRequestException("Invalid mensual periodValue");
      const year = Number(match[1]);
      const month = Number(match[2]) - 1;
      if (month < 0 || month > 11) throw new BadRequestException("Invalid mensual periodValue");
      return { start: new Date(year, month, 1), end: new Date(year, month + 1, 0, 23, 59, 59, 999) };
    }
    throw new BadRequestException("Invalid periodType");
  }

  private async assertNoDuplicate(userId: string, periodType: string, periodValue: string, exceptId?: string) {
    const existing = await this.prisma.sellerGoal.findFirst({
      where: { userId, periodType, periodValue: periodValue.toUpperCase() },
    });
    if (existing && existing.id !== exceptId) throw new ConflictException("Seller goal already exists for this period");
  }

  private async findGoalForUser(userId: string, goalId: string) {
    const goal = await this.prisma.sellerGoal.findUnique({ where: { id: goalId } });
    if (!goal || goal.userId !== userId) throw new NotFoundException("Seller goal not found");
    return goal;
  }

  private async resolveGoal(userId: string, periodType?: string, periodValue?: string) {
    if (periodType && periodValue) {
      this.assertPeriod(periodType, periodValue.toUpperCase());
      const goal = await this.prisma.sellerGoal.findFirst({
        where: { userId, periodType, periodValue: periodValue.toUpperCase() },
        include: { user: { select: { id: true, name: true } } },
      });
      if (!goal) throw new NotFoundException("Seller goal not found for period");
      return goal;
    }
    const goal = await this.prisma.sellerGoal.findFirst({
      where: { userId },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
    if (!goal) throw new NotFoundException("No seller goals found");
    return goal;
  }

  private normalizeDashboardPeriod(periodType?: string, periodValue?: string) {
    if (periodType && periodValue) {
      const normalizedValue = periodValue.toUpperCase();
      this.assertPeriod(periodType, normalizedValue);
      return { periodType, periodValue: normalizedValue };
    }
    const now = new Date();
    return {
      periodType: "mensual",
      periodValue: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
    };
  }
}
```

- [ ] **Step 5: Add controller and module**

Create `apps/api/src/modules/seller-goals/seller-goals.controller.ts`:

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, ValidationPipe } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { AuthUser } from "../auth/types/authenticated-request";
import { CreateSellerGoalDto } from "./dto/create-seller-goal.dto";
import { UpdateSellerGoalDto } from "./dto/update-seller-goal.dto";
import { SellerGoalsService } from "./seller-goals.service";

@Controller("users")
export class SellerGoalsController {
  constructor(private readonly sellerGoals: SellerGoalsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial")
  @Post(":id/seller-goals")
  create(@CurrentUser() user: AuthUser, @Param("id") userId: string, @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })) dto: CreateSellerGoalDto) {
    return this.sellerGoals.create(user, userId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial", "comercial")
  @Get(":id/seller-goals")
  findAll(@CurrentUser() user: AuthUser, @Param("id") userId: string) {
    return this.sellerGoals.findAll(user, userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial")
  @Patch(":id/seller-goals/:goalId")
  update(@CurrentUser() user: AuthUser, @Param("id") userId: string, @Param("goalId") goalId: string, @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })) dto: UpdateSellerGoalDto) {
    return this.sellerGoals.update(user, userId, goalId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial")
  @Delete(":id/seller-goals/:goalId")
  remove(@CurrentUser() user: AuthUser, @Param("id") userId: string, @Param("goalId") goalId: string) {
    return this.sellerGoals.remove(user, userId, goalId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial", "comercial")
  @Get(":id/seller-goals/progress")
  progress(@CurrentUser() user: AuthUser, @Param("id") userId: string, @Query("periodType") periodType?: string, @Query("periodValue") periodValue?: string, @Query("companyId") companyId?: string) {
    return this.sellerGoals.getProgress(user, userId, periodType, periodValue, companyId);
  }
}
```

Create `apps/api/src/modules/seller-goals/seller-goals.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../../prisma/prisma.module";
import { SellerGoalsController } from "./seller-goals.controller";
import { SellerGoalsService } from "./seller-goals.service";

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [SellerGoalsController],
  providers: [SellerGoalsService],
  exports: [SellerGoalsService],
})
export class SellerGoalsModule {}
```

- [ ] **Step 6: Register module**

Modify `apps/api/src/app.module.ts`:

```ts
import { SellerGoalsModule } from "./modules/seller-goals/seller-goals.module";
```

Add `SellerGoalsModule` to `imports` near `CustomerGoalsModule`.

- [ ] **Step 7: Run API tests to verify GREEN**

Run: `pnpm --filter @norgtech/api test -- seller-goals.e2e-spec.ts`

Expected: PASS.

- [ ] **Step 8: Commit API CRUD**

```bash
git add apps/api/src/modules/seller-goals apps/api/src/app.module.ts apps/api/test/seller-goals.e2e-spec.ts
git commit -m "feat: add seller goals api"
```

---

## Task 3: Dashboard Aggregate Endpoint

**Files:**
- Modify: `apps/api/src/modules/dashboard/dashboard.controller.ts`
- Modify: `apps/api/src/modules/dashboard/dashboard.module.ts`
- Modify: `apps/api/test/seller-goals.e2e-spec.ts`

- [ ] **Step 1: Add failing dashboard test**

Append to `apps/api/test/seller-goals.e2e-spec.ts`:

```ts
it("returns seller goals dashboard totals for the selected period", async () => {
  const response = await request(globalThis.__APP__)
    .get("/dashboard/seller-goals?periodType=mensual&periodValue=2026-06")
    .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
    .expect(200);

  expect(response.body.periodType).toBe("mensual");
  expect(response.body.periodValue).toBe("2026-06");
  expect(response.body.totals.targetAmount).toBe(300000000);
  expect(response.body.totals.soldAmount).toBe(120000000);
  expect(response.body.items[0].sellerName).toBe("Sebastian");
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `pnpm --filter @norgtech/api test -- seller-goals.e2e-spec.ts`

Expected: FAIL with 404 for `/dashboard/seller-goals`.

- [ ] **Step 3: Wire dashboard endpoint**

Modify `apps/api/src/modules/dashboard/dashboard.module.ts`:

```ts
import { SellerGoalsModule } from "../seller-goals/seller-goals.module";

@Module({
  imports: [PrismaModule, AuthModule, SellerGoalsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
```

Modify `apps/api/src/modules/dashboard/dashboard.controller.ts` constructor and method:

```ts
constructor(
  private readonly dashboardService: DashboardService,
  private readonly sellerGoalsService: SellerGoalsService,
) {}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("administrador", "director_comercial")
@Get("seller-goals")
getSellerGoals(
  @CurrentUser() user: AuthUser,
  @Query("periodType") periodType?: string,
  @Query("periodValue") periodValue?: string,
  @Query("companyId") companyId?: string,
) {
  return this.sellerGoalsService.getDashboard(user, periodType, periodValue, companyId);
}
```

Add import:

```ts
import { SellerGoalsService } from "../seller-goals/seller-goals.service";
```

- [ ] **Step 4: Run tests to verify GREEN**

Run: `pnpm --filter @norgtech/api test -- seller-goals.e2e-spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit dashboard endpoint**

```bash
git add apps/api/src/modules/dashboard apps/api/test/seller-goals.e2e-spec.ts
git commit -m "feat: expose seller goals dashboard"
```

---

## Task 4: Dashboard UI

**Files:**
- Create: `apps/web/src/components/dashboard/seller-goals-dashboard.tsx`
- Modify: `apps/web/src/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Create dashboard component**

Create `apps/web/src/components/dashboard/seller-goals-dashboard.tsx`:

```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface SellerGoalDashboardItem {
  userId: string;
  sellerName: string;
  targetAmount: number;
  soldAmount: number;
  percentage: number;
  remainingAmount: number;
  ordersCount: number;
  customersCount: number;
}

export interface SellerGoalsDashboardSummary {
  periodType: string;
  periodValue: string;
  companyId: string | null;
  totals: {
    targetAmount: number;
    soldAmount: number;
    percentage: number;
    remainingAmount: number;
    sellers: number;
  };
  items: SellerGoalDashboardItem[];
}

const currencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function formatCurrency(value: number) {
  return currencyFormatter.format(Math.round(value));
}

function statusLabel(percentage: number) {
  if (percentage >= 100) return { label: "Cumplida", className: "bg-emerald-100 text-emerald-800" };
  if (percentage >= 80) return { label: "Cerca", className: "bg-amber-100 text-amber-800" };
  return { label: "En progreso", className: "bg-slate-100 text-slate-700" };
}

export function SellerGoalsDashboard({ summary }: { summary: SellerGoalsDashboardSummary | null }) {
  if (!summary) return null;
  const totals = summary.totals;

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-lg font-bold">Metas por vendedor</CardTitle>
        <CardDescription>
          Cumplimiento comercial para {summary.periodValue}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {summary.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay metas por vendedor para este periodo.</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Meta total" value={formatCurrency(totals.targetAmount)} />
              <Metric label="Vendido" value={formatCurrency(totals.soldAmount)} />
              <Metric label="Cumplimiento" value={`${totals.percentage.toFixed(1)}%`} />
              <Metric label="Faltante" value={formatCurrency(totals.remainingAmount)} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Vendedor</th>
                    <th className="py-2 px-3 text-right font-medium">Meta</th>
                    <th className="py-2 px-3 text-right font-medium">Vendido</th>
                    <th className="py-2 px-3 text-right font-medium">%</th>
                    <th className="py-2 px-3 text-right font-medium">Faltante</th>
                    <th className="py-2 px-3 text-right font-medium">Pedidos</th>
                    <th className="py-2 pl-3 text-right font-medium">Clientes</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.items.map((item) => {
                    const status = statusLabel(item.percentage);
                    return (
                      <tr key={item.userId} className="border-b border-border/60">
                        <td className="py-3 pr-3">
                          <div className="font-medium">{item.sellerName}</div>
                          <div className="mt-2 h-2 w-full rounded-full bg-muted">
                            <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(item.percentage, 100)}%` }} />
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right">{formatCurrency(item.targetAmount)}</td>
                        <td className="py-3 px-3 text-right">{formatCurrency(item.soldAmount)}</td>
                        <td className="py-3 px-3 text-right">
                          <Badge className={status.className}>{item.percentage.toFixed(1)}% {status.label}</Badge>
                        </td>
                        <td className="py-3 px-3 text-right">{formatCurrency(item.remainingAmount)}</td>
                        <td className="py-3 px-3 text-right">{item.ordersCount}</td>
                        <td className="py-3 pl-3 text-right">{item.customersCount}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
```

- [ ] **Step 2: Wire dashboard fetch**

Modify `apps/web/src/app/(app)/dashboard/page.tsx`:

```tsx
import {
  SellerGoalsDashboard,
  type SellerGoalsDashboardSummary,
} from "@/components/dashboard/seller-goals-dashboard";
```

Add query and fetch in `DashboardPage`:

```tsx
const sellerGoalsQuery = companyId
  ? `/dashboard/seller-goals?companyId=${companyId}`
  : "/dashboard/seller-goals";

const [response, commercialAdvancedResponse, companiesRes, sellerGoalsRes] = await Promise.all([
  apiFetch(summaryQuery),
  canViewCommercialAdvanced ? apiFetch(commercialQuery) : Promise.resolve(null),
  apiFetch("/companies"),
  canViewCommercialAdvanced ? apiFetch(sellerGoalsQuery) : Promise.resolve(null),
]);

const sellerGoalsSummary: SellerGoalsDashboardSummary | null =
  sellerGoalsRes?.ok ? await sellerGoalsRes.json() : null;
```

Render after `<CustomerGoalsDashboard />`:

```tsx
<SellerGoalsDashboard summary={sellerGoalsSummary} />
```

- [ ] **Step 3: Run web build**

Run: `pnpm --filter @norgtech/web build`

Expected: build succeeds.

- [ ] **Step 4: Commit dashboard UI**

```bash
git add apps/web/src/components/dashboard/seller-goals-dashboard.tsx 'apps/web/src/app/(app)/dashboard/page.tsx'
git commit -m "feat: show seller goals dashboard"
```

---

## Task 5: User Management UI

**Files:**
- Create: `apps/web/src/components/users/seller-goals-manager.tsx`
- Modify: `apps/web/src/components/users/user-management-client.tsx`

- [ ] **Step 1: Create seller goals manager**

Create `apps/web/src/components/users/seller-goals-manager.tsx`:

```tsx
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetchClient } from "@/lib/api.client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SellerGoal {
  id: string;
  userId: string;
  periodType: string;
  periodValue: string;
  targetAmount: string | number;
  notes: string | null;
}

export function SellerGoalsManager({ userId, canManage }: { userId: string; canManage: boolean }) {
  const [goals, setGoals] = useState<SellerGoal[]>([]);
  const [periodType, setPeriodType] = useState("mensual");
  const [periodValue, setPeriodValue] = useState(new Date().toISOString().slice(0, 7));
  const [targetAmount, setTargetAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadGoals() {
      const response = await apiFetchClient(`/users/${userId}/seller-goals`);
      if (!response.ok) return;
      const data = (await response.json()) as SellerGoal[];
      if (!cancelled) setGoals(data);
    }
    loadGoals();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function createGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) return;
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetchClient(`/users/${userId}/seller-goals`, {
        method: "POST",
        body: JSON.stringify({
          periodType,
          periodValue,
          targetAmount: Number(targetAmount),
          notes: notes.trim() || undefined,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? "No se pudo crear la meta");
        return;
      }
      const created = (await response.json()) as SellerGoal;
      setGoals((current) => [created, ...current]);
      setTargetAmount("");
      setNotes("");
    } finally {
      setLoading(false);
    }
  }

  async function deleteGoal(goalId: string) {
    if (!canManage) return;
    const response = await apiFetchClient(`/users/${userId}/seller-goals/${goalId}`, {
      method: "DELETE",
    });
    if (response.ok) {
      setGoals((current) => current.filter((goal) => goal.id !== goalId));
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border/60 p-3">
      <div className="text-sm font-semibold">Metas comerciales</div>
      {canManage && (
        <form className="grid gap-2 sm:grid-cols-[120px_120px_1fr_auto]" onSubmit={createGoal}>
          <div>
            <Label className="sr-only" htmlFor={`period-type-${userId}`}>Periodo</Label>
            <select id={`period-type-${userId}`} className="h-9 w-full rounded-lg border bg-background px-2 text-sm" value={periodType} onChange={(event) => setPeriodType(event.target.value)}>
              <option value="mensual">Mensual</option>
              <option value="trimestral">Trimestral</option>
              <option value="anual">Anual</option>
            </select>
          </div>
          <Input value={periodValue} onChange={(event) => setPeriodValue(event.target.value.toUpperCase())} placeholder="2026-06" />
          <Input value={targetAmount} onChange={(event) => setTargetAmount(event.target.value)} inputMode="numeric" placeholder="Meta COP" />
          <Button type="submit" disabled={loading || !targetAmount}>Crear</Button>
          <Input className="sm:col-span-3" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notas" />
        </form>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {goals.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin metas registradas.</p>
      ) : (
        <div className="space-y-2">
          {goals.map((goal) => (
            <div key={goal.id} className="flex items-center justify-between gap-3 rounded-md bg-muted/30 px-3 py-2 text-sm">
              <span>{goal.periodValue} · {Number(goal.targetAmount).toLocaleString("es-CO")}</span>
              {canManage && (
                <Button type="button" variant="outline" size="sm" onClick={() => deleteGoal(goal.id)}>
                  Eliminar
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Render manager for seller roles**

Modify `apps/web/src/components/users/user-management-client.tsx`:

```tsx
import { SellerGoalsManager } from "@/components/users/seller-goals-manager";
```

Inside each user row/detail area, render:

```tsx
{(user.role === "comercial" || user.role === "director_comercial") && (
  <TableRow>
    <TableCell colSpan={6}>
      <SellerGoalsManager userId={user.id} canManage />
    </TableCell>
  </TableRow>
)}
```

If the current component uses a fixed number of columns, set `colSpan` to the current header count. Keep controls visible only for admins/directors if current role is available; if not available in this component, rely on backend permissions for this phase.

- [ ] **Step 3: Run web build**

Run: `pnpm --filter @norgtech/web build`

Expected: build succeeds.

- [ ] **Step 4: Commit user UI**

```bash
git add apps/web/src/components/users/seller-goals-manager.tsx apps/web/src/components/users/user-management-client.tsx
git commit -m "feat: manage seller goals in users"
```

---

## Task 6: Full Verification

**Files:**
- All files changed in prior tasks.

- [ ] **Step 1: Run targeted API tests**

Run: `pnpm --filter @norgtech/api test -- seller-goals.e2e-spec.ts`

Expected: PASS.

- [ ] **Step 2: Run affected existing API tests**

Run: `pnpm --filter @norgtech/api test -- customer-goals.e2e-spec.ts dashboard.e2e-spec.ts users.e2e-spec.ts orders.e2e-spec.ts`

Expected: PASS.

- [ ] **Step 3: Run API build or compile check**

Run: `pnpm --filter @norgtech/api build`

Expected: build succeeds.

- [ ] **Step 4: Run web build**

Run: `pnpm --filter @norgtech/web build`

Expected: build succeeds.

- [ ] **Step 5: Inspect git diff**

Run: `git status --short`

Expected: only intentional seller-goals files are modified; pre-existing unrelated files remain untouched and unstaged unless already part of the user's work.

- [ ] **Step 6: Final commit**

If any verification fixes were needed after the previous commits:

```bash
git add apps/api apps/web
git commit -m "fix: verify seller goals phase"
```

Do not include unrelated existing changes such as invoice/order work or local Excel files.

---

## Self-Review

Spec coverage:

- Seller goal model: Task 1.
- CRUD API: Task 2.
- Progress by assigned customers: Task 2 service and tests.
- Dashboard aggregate endpoint: Task 3.
- Dashboard UI: Task 4.
- User management UI: Task 5.
- Permissions and duplicate validation: Task 2.
- Verification: Task 6.

Placeholder scan:

- No `TBD`, `TODO`, or unspecified implementation steps remain.

Type consistency:

- API uses `SellerGoalsService`, `SellerGoalsController`, and `SellerGoalsModule`.
- Frontend summary types match the dashboard endpoint response from `getDashboard`.
