# Zonas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace free-text `Order.zone` with a formal Zone catalog, CustomerZone assignments with per-zone seller, and structured FK on orders.

**Architecture:** New `Zone` (catalog) and `CustomerZone` (join: customer + zone + seller + address) models. Order references `CustomerZone` via `customerZoneId`. Order form selects from customer's zones. Dashboard groups by zone name.

**Tech Stack:** NestJS + Prisma (PostgreSQL), Next.js 16 App Router, TypeScript, class-validator DTOs

---

## Task 1: Prisma Schema + Migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

### Step 1: Add Zone and CustomerZone models

Add after the existing models in `apps/api/prisma/schema.prisma`:

```prisma
model Zone {
  id         String   @id @default(cuid())
  name       String   @unique
  department String?
  isActive   Boolean  @default(true)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  customerZones CustomerZone[]
}

model CustomerZone {
  id               String   @id @default(cuid())
  customerId       String
  zoneId           String
  address          String?
  assignedToUserId String?
  isActive         Boolean  @default(true)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  customer   Customer @relation(fields: [customerId], references: [id])
  zone       Zone     @relation(fields: [zoneId], references: [id])
  assignedTo User?    @relation(fields: [assignedToUserId], references: [id])
  orders     Order[]

  @@unique([customerId, zoneId])
}
```

### Step 2: Add customerZoneId to Order, mark zone as deprecated

In the `Order` model, add before `createdAt`:

```prisma
  customerZoneId String?
  customerZone   CustomerZone? @relation(fields: [customerZoneId], references: [id])
```

Keep the `zone String?` field in the schema (for existing data) but don't use it in new code.

### Step 3: Add Customer.customerZones relation

In the `Customer` model, add the relation:

```prisma
  customerZones  CustomerZone[]
```

### Step 4: Run migration and generate client

```bash
cd apps/api && npx prisma migrate dev --name add_zones_model && npx prisma generate
```

### Step 5: Commit

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat: add Zone and CustomerZone models with customerZoneId on Order"
```

---

## Task 2: Zones CRUD Module (Backend)

**Files:**
- Create: `apps/api/src/modules/zones/zones.module.ts`
- Create: `apps/api/src/modules/zones/zones.controller.ts`
- Create: `apps/api/src/modules/zones/zones.service.ts`
- Create: `apps/api/src/modules/zones/dto/create-zone.dto.ts`
- Create: `apps/api/src/modules/zones/dto/update-zone.dto.ts`
- Modify: `apps/api/src/app.module.ts`

### Step 1: Create DTOs

Create `apps/api/src/modules/zones/dto/create-zone.dto.ts`:

```typescript
import { IsNotEmpty, IsOptional, IsString, MinLength } from "class-validator";

export class CreateZoneDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  department?: string;
}
```

Create `apps/api/src/modules/zones/dto/update-zone.dto.ts`:

```typescript
import { IsBoolean, IsOptional, IsString, MinLength } from "class-validator";

export class UpdateZoneDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
```

### Step 2: Create service

Create `apps/api/src/modules/zones/zones.service.ts`:

```typescript
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateZoneDto } from "./dto/create-zone.dto";
import { UpdateZoneDto } from "./dto/update-zone.dto";

@Injectable()
export class ZonesService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateZoneDto) {
    return this.prisma.zone.create({
      data: { name: dto.name, department: dto.department },
    });
  }

  findAll() {
    return this.prisma.zone.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
  }

  async findOne(id: string) {
    const zone = await this.prisma.zone.findUnique({ where: { id } });
    if (!zone) throw new NotFoundException("Zone not found");
    return zone;
  }

  async update(id: string, dto: UpdateZoneDto) {
    await this.findOne(id);
    if (dto.name) {
      const existing = await this.prisma.zone.findUnique({ where: { name: dto.name } });
      if (existing && existing.id !== id) {
        throw new BadRequestException("Zone name already in use");
      }
    }
    return this.prisma.zone.update({ where: { id }, data: dto });
  }
}
```

### Step 3: Create controller

Create `apps/api/src/modules/zones/zones.controller.ts`:

```typescript
import { Body, Controller, Get, Param, Patch, Post, UseGuards, ValidationPipe } from "@nestjs/common";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { ZonesService } from "./zones.service";
import { CreateZoneDto } from "./dto/create-zone.dto";
import { UpdateZoneDto } from "./dto/update-zone.dto";

@Controller("zones")
export class ZonesController {
  constructor(private readonly zonesService: ZonesService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador")
  @Post()
  create(@Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })) dto: CreateZoneDto) {
    return this.zonesService.create(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial")
  @Get()
  findAll() {
    return this.zonesService.findAll();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial")
  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.zonesService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador")
  @Patch(":id")
  update(@Param("id") id: string, @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })) dto: UpdateZoneDto) {
    return this.zonesService.update(id, dto);
  }
}
```

### Step 4: Create module and register

Create `apps/api/src/modules/zones/zones.module.ts`:

```typescript
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ZonesController } from "./zones.controller";
import { ZonesService } from "./zones.service";

@Module({
  imports: [AuthModule],
  controllers: [ZonesController],
  providers: [ZonesService],
})
export class ZonesModule {}
```

In `apps/api/src/app.module.ts`, add import and register `ZonesModule`.

### Step 5: Commit

```bash
git add apps/api/src/modules/zones/ apps/api/src/app.module.ts
git commit -m "feat: add Zones CRUD module"
```

---

## Task 3: CustomerZone Assignment Endpoints (in Customers Module)

**Files:**
- Modify: `apps/api/src/modules/customers/customers.controller.ts`
- Modify: `apps/api/src/modules/customers/customers.service.ts`
- Create: `apps/api/src/modules/customers/dto/assign-zone.dto.ts`
- Create: `apps/api/src/modules/customers/dto/update-customer-zone.dto.ts`

### Step 1: Create DTOs

Create `apps/api/src/modules/customers/dto/assign-zone.dto.ts`:

```typescript
import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class AssignZoneDto {
  @IsString()
  @IsNotEmpty()
  zoneId!: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  assignedToUserId?: string;
}
```

Create `apps/api/src/modules/customers/dto/update-customer-zone.dto.ts`:

```typescript
import { IsBoolean, IsOptional, IsString } from "class-validator";

export class UpdateCustomerZoneDto {
  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  assignedToUserId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
```

### Step 2: Add service methods to CustomersService

In `apps/api/src/modules/customers/customers.service.ts`, add these methods:

```typescript
import { BadRequestException } from "@nestjs/common";
import { AssignZoneDto } from "./dto/assign-zone.dto";
import { UpdateCustomerZoneDto } from "./dto/update-customer-zone.dto";

// Inside CustomersService class:

  async getCustomerZones(customerId: string) {
    return this.prisma.customerZone.findMany({
      where: { customerId, isActive: true },
      include: { zone: true, assignedTo: { select: { id: true, name: true } } },
      orderBy: { zone: { name: "asc" } },
    });
  }

  async assignZoneToCustomer(customerId: string, dto: AssignZoneDto) {
    await this.prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    await this.prisma.zone.findUniqueOrThrow({ where: { id: dto.zoneId } });

    const existing = await this.prisma.customerZone.findUnique({
      where: { customerId_zoneId: { customerId, zoneId: dto.zoneId } },
    });
    if (existing) {
      if (existing.isActive) throw new BadRequestException("Zone already assigned to customer");
      return this.prisma.customerZone.update({
        where: { id: existing.id },
        data: { isActive: true, address: dto.address, assignedToUserId: dto.assignedToUserId },
        include: { zone: true, assignedTo: { select: { id: true, name: true } } },
      });
    }

    return this.prisma.customerZone.create({
      data: {
        customerId,
        zoneId: dto.zoneId,
        address: dto.address,
        assignedToUserId: dto.assignedToUserId,
      },
      include: { zone: true, assignedTo: { select: { id: true, name: true } } },
    });
  }

  async updateCustomerZone(customerId: string, customerZoneId: string, dto: UpdateCustomerZoneDto) {
    const cz = await this.prisma.customerZone.findUnique({ where: { id: customerZoneId } });
    if (!cz || cz.customerId !== customerId) {
      throw new NotFoundException("Customer zone assignment not found");
    }
    return this.prisma.customerZone.update({
      where: { id: customerZoneId },
      data: dto,
      include: { zone: true, assignedTo: { select: { id: true, name: true } } },
    });
  }

  async removeCustomerZone(customerId: string, customerZoneId: string) {
    const cz = await this.prisma.customerZone.findUnique({ where: { id: customerZoneId } });
    if (!cz || cz.customerId !== customerId) {
      throw new NotFoundException("Customer zone assignment not found");
    }
    return this.prisma.customerZone.update({
      where: { id: customerZoneId },
      data: { isActive: false },
    });
  }
```

### Step 3: Add controller endpoints to CustomersController

In `apps/api/src/modules/customers/customers.controller.ts`, add after existing endpoints:

```typescript
  @UseGuards(JwtAuthGuard)
  @Get(":id/zones")
  getZones(@Param("id") id: string) {
    return this.customersService.getCustomerZones(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial")
  @Post(":id/zones")
  assignZone(
    @Param("id") id: string,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })) dto: AssignZoneDto,
  ) {
    return this.customersService.assignZoneToCustomer(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial")
  @Patch(":id/zones/:customerZoneId")
  updateZone(
    @Param("id") id: string,
    @Param("customerZoneId") customerZoneId: string,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })) dto: UpdateCustomerZoneDto,
  ) {
    return this.customersService.updateCustomerZone(id, customerZoneId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial")
  @Delete(":id/zones/:customerZoneId")
  removeZone(
    @Param("id") id: string,
    @Param("customerZoneId") customerZoneId: string,
  ) {
    return this.customersService.removeCustomerZone(id, customerZoneId);
  }
```

Import AssignZoneDto, UpdateCustomerZoneDto at the top of the file.

### Step 4: Commit

```bash
git add apps/api/src/modules/customers/
git commit -m "feat: add CustomerZone assignment endpoints to customers module"
```

---

## Task 4: Update Orders for customerZoneId

**Files:**
- Modify: `apps/api/src/modules/orders/dto/create-order.dto.ts`
- Modify: `apps/api/src/modules/orders/orders.service.ts`

### Step 1: Replace zone with customerZoneId in CreateOrderDto

In `apps/api/src/modules/orders/dto/create-order.dto.ts`, remove the `zone` field:

```typescript
  // @IsOptional()
  // @IsString()
  // zone?: string;   ← REMOVE
```

And add:

```typescript
  @IsOptional()
  @IsString()
  customerZoneId?: string;
```

### Step 2: Add customerZoneId validation in OrdersService.create()

In `apps/api/src/modules/orders/orders.service.ts`, after the company validation and before `itemsWithSnapshot`, add:

```typescript
    if (dto.customerZoneId) {
      const customerZone = await this.prisma.customerZone.findUnique({
        where: { id: dto.customerZoneId },
      });
      if (!customerZone || !customerZone.isActive) {
        throw new NotFoundException("Customer zone assignment not found or inactive");
      }
      if (customerZone.customerId !== dto.customerId) {
        throw new BadRequestException("Zone does not belong to selected customer");
      }
    }
```

### Step 3: Add customerZoneId to order creation data

In the `tx.order.create` data object, replace `zone: dto.zone || null,` with:

```typescript
          customerZoneId: dto.customerZoneId || null,
```

### Step 4: Update findOne and findAll includes

Add `customerZone: { include: { zone: true, assignedTo: { select: { id: true, name: true } } } }` to the include objects in both `findOne` and `findAll`.

### Step 5: Commit

```bash
git add apps/api/src/modules/orders/
git commit -m "feat: replace zone free-text with customerZoneId FK on orders"
```

---

## Task 5: Update Dashboard byZone Grouping

**Files:**
- Modify: `apps/api/src/modules/dashboard/dashboard.service.ts`

### Step 1: Update byZone aggregation

In `getCommercialAdvancedSummary`, find where `byZoneMap` is populated. Currently it uses `order.zone?.trim() || "Sin zona"`. Replace with:

```typescript
      const zoneName = order.customerZone?.zone?.name?.trim() || "Sin zona";
```

For this to work, the order query in the dashboard must include `customerZone` with `zone`. Add to the order include:

```typescript
      include: {
        customer: { select: { id: true, displayName: true, assignedToUserId: true } },
        customerZone: { include: { zone: { select: { name: true } } } },
      },
```

Also add `customerZone` and `zone` to the `CommercialOrder` type at the top of the file:

```typescript
type CommercialOrder = {
  // ... existing fields ...
  customerZone?: { zone: { name: string } } | null;
};
```

### Step 2: Commit

```bash
git add apps/api/src/modules/dashboard/
git commit -m "feat: group dashboard byZone using Zone catalog names"
```

---

## Task 6: Seed Zones

**Files:**
- Modify: `apps/api/prisma/seed.ts`

### Step 1: Add zone seed data

After the companies seed section, add:

```typescript
// -- Zones ----------------------------------------------------
const zones = [
  { name: "Costa", department: "Atlantico" },
  { name: "Centro", department: "Cundinamarca" },
  { name: "Santander", department: "Santander" },
  { name: "Valle", department: "Valle del Cauca" },
  { name: "Antioquia", department: "Antioquia" },
  { name: "Bogota", department: "Cundinamarca" },
];

for (const z of zones) {
  await prisma.zone.upsert({
    where: { name: z.name },
    update: {},
    create: z,
  });
}
```

### Step 2: Update seed log

Add: `console.log("   - 6 zonas");`

### Step 3: Commit

```bash
git add apps/api/prisma/seed.ts
git commit -m "feat: seed initial zones"
```

---

## Task 7: Zones Frontend Pages

**Files:**
- Create: `apps/web/src/app/(app)/zones/page.tsx`
- Create: `apps/web/src/app/(app)/zones/new/page.tsx`
- Create: `apps/web/src/app/(app)/zones/[id]/page.tsx`
- Modify: `apps/web/src/lib/theme.ts`

### Step 1: Create /zones list page

Create `apps/web/src/app/(app)/zones/page.tsx`:

```tsx
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button-link";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiFetch } from "@/lib/api.server";

interface Zone {
  id: string;
  name: string;
  department: string | null;
  isActive: boolean;
}

const columns: readonly DataTableColumn<Zone>[] = [
  {
    key: "name",
    header: "Nombre",
    render: (row) => (
      <Link href={`/zones/${row.id}`} style={{ fontWeight: 700, color: "#10233f", textDecoration: "none" }}>
        {row.name}
      </Link>
    ),
  },
  {
    key: "department",
    header: "Departamento",
    render: (row) => row.department || "—",
  },
  {
    key: "status",
    header: "Estado",
    render: (row) => (
      <StatusBadge tone={row.isActive ? "success" : "neutral"}>
        {row.isActive ? "Activa" : "Inactiva"}
      </StatusBadge>
    ),
  },
] as const;

export default async function ZonesPage() {
  const response = await apiFetch("/zones");
  const zones: Zone[] = response.ok ? await response.json() : [];

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <PageHeader
        eyebrow="Catálogo"
        title="Zonas"
        description="Zonas de despacho para pedidos y análisis territorial."
        actions={<ButtonLink href="/zones/new">Nueva zona</ButtonLink>}
      />
      <FilterBar summary={`${zones.length.toLocaleString("es-CO")} zonas registradas`} />
      <SectionCard title="Catálogo de zonas" description="Gestiona las zonas disponibles para asignar a clientes.">
        <DataTable
          columns={columns}
          rows={zones}
          getRowKey={(row) => row.id}
          emptyState={
            <EmptyState
              title="No hay zonas registradas"
              description="Crea la primera zona para empezar a asignarlas a clientes."
              action={<ButtonLink href="/zones/new">Crear zona</ButtonLink>}
            />
          }
        />
      </SectionCard>
    </div>
  );
}
```

### Step 2: Create /zones/new page

Create `apps/web/src/app/(app)/zones/new/page.tsx`:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetchClient } from "@/lib/api.client";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";

export default function NewZonePage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const formData = new FormData(event.currentTarget);
    const body = {
      name: String(formData.get("name") ?? "").trim(),
      department: String(formData.get("department") ?? "").trim() || undefined,
    };
    if (!body.name) { setError("El nombre es obligatorio"); setLoading(false); return; }
    try {
      const res = await apiFetchClient("/zones", { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.message || "Error"); setLoading(false); return; }
      const created = await res.json();
      router.push(`/zones/${created.id}`);
    } catch { setError("Error de conexion"); setLoading(false); }
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Zonas" title="Nueva zona" actions={<ButtonLink href="/zones" variant="secondary">Volver</ButtonLink>} />
      <SectionCard>
        <form onSubmit={handleSubmit} className="grid gap-6 max-w-lg">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="grid gap-1"><Label htmlFor="name">Nombre *</Label><Input id="name" name="name" required placeholder="Costa" /></div>
          <div className="grid gap-1"><Label htmlFor="department">Departamento</Label><Input id="department" name="department" placeholder="Atlantico" /></div>
          <Button type="submit" disabled={loading}>{loading ? "Guardando..." : "Guardar zona"}</Button>
        </form>
      </SectionCard>
    </div>
  );
}
```

### Step 3: Create /zones/[id] edit page

Create `apps/web/src/app/(app)/zones/[id]/page.tsx`:

```tsx
"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import { apiFetchClient } from "@/lib/api.client";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";

export default function ZoneDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [zone, setZone] = useState<{ name: string; department: string | null; isActive: boolean } | null>(null);

  useEffect(() => {
    apiFetchClient(`/zones/${id}`).then(r => r.json()).then(setZone);
  }, [id]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const formData = new FormData(event.currentTarget);
    const body: Record<string, unknown> = {};
    const name = String(formData.get("name") ?? "").trim();
    const department = String(formData.get("department") ?? "").trim();
    if (name) body.name = name;
    if (department) body.department = department;
    body.isActive = formData.get("isActive") === "on";
    try {
      const res = await apiFetchClient(`/zones/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.message || "Error"); setLoading(false); return; }
      router.push("/zones");
    } catch { setError("Error de conexion"); setLoading(false); }
  }

  if (!zone) return null;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Zonas" title={zone.name} actions={<ButtonLink href="/zones" variant="secondary">Volver</ButtonLink>} />
      <SectionCard>
        <form onSubmit={handleSubmit} className="grid gap-6 max-w-lg">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="grid gap-1"><Label htmlFor="name">Nombre</Label><Input id="name" name="name" defaultValue={zone.name} /></div>
          <div className="grid gap-1"><Label htmlFor="department">Departamento</Label><Input id="department" name="department" defaultValue={zone.department ?? ""} /></div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="isActive" name="isActive" defaultChecked={zone.isActive} className="h-4 w-4" />
            <Label htmlFor="isActive">Activa</Label>
          </div>
          <Button type="submit" disabled={loading}>{loading ? "Guardando..." : "Guardar cambios"}</Button>
        </form>
      </SectionCard>
    </div>
  );
}
```

### Step 4: Add navigation item

In `apps/web/src/lib/theme.ts`, add after the "Segmentos" nav item:

```typescript
  {
    href: "/zones",
    label: "Zonas",
    shortLabel: "ZN",
    description: "Catalogo de zonas de despacho",
    group: "Catalogo",
    requiredRoles: ["administrador", "director_comercial"] as const,
  },
```

### Step 5: Commit

```bash
git add apps/web/src/app/\(app\)/zones/ apps/web/src/lib/theme.ts
git commit -m "feat: add Zones CRUD frontend pages and navigation"
```

---

## Task 8: Update Order Form Frontend for Zone Selector

**Files:**
- Modify: `apps/web/src/components/orders/order-form.tsx`

### Step 1: Add zone fetching logic

In `apps/web/src/components/orders/order-form.tsx`, add state for customer zones:

```tsx
import { CompanySelect } from "@/components/companies/company-select";

// After existing state declarations:
  const [customerZones, setCustomerZones] = useState<Array<{ id: string; zone: { name: string }; assignedTo: { name: string } | null }>>([]);
```

### Step 2: Fetch zones when customer changes

Add a function to fetch zones:

```tsx
  function fetchCustomerZones(customerId: string) {
    if (!customerId) { setCustomerZones([]); return; }
    apiFetchClient(`/customers/${customerId}/zones`)
      .then(r => r.json())
      .then(setCustomerZones)
      .catch(() => setCustomerZones([]));
  }
```

In the `handleSubmit` function, also store `customerZoneId`:

```typescript
      customerZoneId: optionalString(formData.get("customerZoneId")),
```

### Step 3: Add zone selector to the form

In the "Encabezado del pedido" section, after the CompanySelect field, add:

```tsx
          {customerZones.length > 0 && (
            <Field label="Zona de despacho" htmlFor="customerZoneId">
              <select id="customerZoneId" name="customerZoneId" className={selectClasses}>
                <option value="">Sin zona especifica</option>
                {customerZones.map((cz) => (
                  <option key={cz.id} value={cz.id}>
                    {cz.zone.name}{cz.assignedTo ? ` — ${cz.assignedTo.name}` : ""}
                  </option>
                ))}
              </select>
            </Field>
          )}
```

### Step 4: Trigger zone fetch on customer change

Find the customer `<select>` element and add an `onChange` handler. The current select is `<select id="customerId" name="customerId" required className={selectClasses}>`. Add after the `<select>` opening:

Actually, the simplest approach: add the fetch call in the `handleSubmit` or watch the customer select. The cleanest way is to add a hidden effect:

```tsx
  // Add after state declarations:
  const [selectedCustomerId, setSelectedCustomerId] = useState("");

  // Add effect:
  useEffect(() => {
    fetchCustomerZones(selectedCustomerId);
  }, [selectedCustomerId]);
```

Then on the customer select, add onChange:

```tsx
            <select
              id="customerId"
              name="customerId"
              required
              className={selectClasses}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
            >
```

### Step 5: Remove old zone text input

Remove the "Zona" free-text input from the "Aprobacion" FormSection. Find:
```tsx
          <Field label="Zona" htmlFor="zone">
            <Input id="zone" name="zone" />
          </Field>
```
And delete these 3 lines.

### Step 6: Commit

```bash
git add apps/web/src/components/orders/order-form.tsx
git commit -m "feat: replace zone text input with customer zone selector in order form"
```

---

## Task 9: Update Customer Detail Page with Zones Section

**Files:**
- Modify: `apps/web/src/app/(app)/customers/[id]/page.tsx`

### Step 1: Add zones section to customer detail

Since the customer detail page is likely a server component, fetch customer zones server-side and display them. The exact implementation depends on the existing page structure. Add after the existing customer sections:

```tsx
  const zonesRes = await apiFetch(`/customers/${id}/zones`);
  const customerZones: Array<{
    id: string;
    zone: { id: string; name: string };
    address: string | null;
    assignedTo: { id: string; name: string } | null;
  }> = zonesRes.ok ? await zonesRes.json() : [];
```

Then render a zones section card:

```tsx
      {customerZones.length > 0 && (
        <SectionCard title="Zonas de despacho" description="Zonas asignadas a este cliente con vendedor por zona.">
          <DataTable
            columns={[
              { key: "zone", header: "Zona", render: (r: typeof customerZones[number]) => r.zone.name },
              { key: "address", header: "Direccion", render: (r: typeof customerZones[number]) => r.address || "—" },
              { key: "seller", header: "Vendedor", render: (r: typeof customerZones[number]) => r.assignedTo?.name || "—" },
            ]}
            rows={customerZones}
            getRowKey={(r) => r.id}
          />
        </SectionCard>
      )}
```

### Step 2: Commit

```bash
git add apps/web/src/app/\(app\)/customers/
git commit -m "feat: add customer zones section to customer detail page"
```

---

## Task 10: Verify and Finalize

**Files:** None

### Step 1: Typecheck

```bash
cd apps/api && npx tsc --noEmit
```

### Step 2: Reset database and seed

```bash
cd apps/api && npx prisma migrate reset --force
```

### Step 3: Verify API endpoints

```bash
curl http://localhost:3001/zones | jq
curl http://localhost:3001/customers/{id}/zones | jq
```

### Step 4: Commit

```bash
git add -A && git commit -m "verify: zonas implementation complete with typecheck and seed"
```
