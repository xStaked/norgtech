# Filtros de búsqueda en clientes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `GET /customers` acepta filtros por query param (search, empresa, estado, segmento, pago) y la lista web los expone como controles en la URL.

**Architecture:** Filtrado en el servidor. El query DTO de customers se extiende con params opcionales que arman un `where` dinámico de Prisma. La página web lee `searchParams`, los reenvía al API (patrón de `invoices/page.tsx`) y un componente cliente nuevo actualiza la URL con `router.replace`.

**Tech Stack:** NestJS 11 + class-validator + Prisma 6 (API), Next.js App Router (web), Jest e2e con PrismaService mockeado.

**Spec:** `docs/superpowers/specs/2026-07-21-filtros-clientes-design.md`

## Global Constraints

- Los e2e del API se corren SOLO con `npx jest --watchman=false --config ./test/jest-e2e.json` desde `apps/api` (agregar `-t "<nombre>"` para acotar). Nunca otro runner.
- Compatibilidad: `GET /customers` sin params nuevos responde EXACTAMENTE igual que hoy (`includeInactive` intacto). Ningún consumidor existente cambia.
- Los stubs de Prisma en e2e usan allowlists que REVIENTAN ante claves desconocidas (patrón `KNOWN_SELECT_KEYS` existente). Toda extensión del stub mantiene esa propiedad.
- Textos de UI en español, sin tildes en identifiers.
- En `apps/web` la verificación de tipos es `npx tsc --noEmit`; los errores pre-existentes bajo `tests/e2e/` (Playwright `fixtures`) se ignoran — cualquier error NUEVO fuera de ahí es fallo.
- Commits pequeños por paso lógico, mensajes en español estilo repo (`feat(clientes): ...`).

---

### Task 1: Query params de filtrado en `GET /customers`

**Files:**
- Create: `apps/api/src/modules/customers/dto/list-customers.query.dto.ts`
- Modify: `apps/api/src/modules/customers/customers.controller.ts:54-59` (método `findAll`)
- Modify: `apps/api/src/modules/customers/customers.service.ts:229-259` (método `findAll`)
- Test: `apps/api/test/customers.e2e-spec.ts`

**Interfaces:**
- Consumes: `IncludeInactiveQueryDto` (`apps/api/src/common/dto/include-inactive.query.ts`), enum `PaymentCondition` de `@prisma/client`.
- Produces: `ListCustomersQueryDto { includeInactive?, search?, companyId?, segmentId?, paymentCondition?, active? }`; `CustomersService.findAll(query?: ListCustomersQueryDto)`. La web (Task 2) consume los params por HTTP: `?search=&companyId=&segmentId=&paymentCondition=&active=&includeInactive=`.

- [ ] **Step 1: Extender el stub de `customer.findMany` para que filtre por las claves nuevas**

En `apps/api/test/customers.e2e-spec.ts`, reemplazar el stub `findMany` del objeto `customer` (el que hoy destructura `{ where, select }` y filtra solo por `where.active`) por esta versión. Conserva el comportamiento actual (filtro por `active`, proyección por `select` con `KNOWN_SELECT_KEYS`) y agrega la allowlist de `where`:

```typescript
        findMany: async ({
          where,
          select,
        }: {
          where?: Record<string, unknown>;
          select?: Record<string, boolean>;
        } = {}) => {
          // Allowlist de where: una clave que el stub no simule haría pasar
          // tests por la razon equivocada. Mejor reventar.
          const KNOWN_WHERE_KEYS = [
            "active",
            "companyId",
            "segmentId",
            "paymentCondition",
            "OR",
          ];
          for (const key of Object.keys(where ?? {})) {
            if (!KNOWN_WHERE_KEYS.includes(key)) {
              throw new Error(
                `customer.findMany stub: clave de where no soportada "${key}". Enséñale la clave al stub antes de usarla.`,
              );
            }
          }

          const w = (where ?? {}) as {
            active?: boolean;
            companyId?: string;
            segmentId?: string;
            paymentCondition?: string;
            OR?: Array<Record<string, { contains: string; mode?: string }>>;
          };

          const filtered = customers.filter((raw) => {
            const c = raw as Record<string, unknown>;
            if (
              w.active !== undefined &&
              ((c.active as boolean | undefined) ?? true) !== w.active
            ) {
              return false;
            }
            if (w.companyId && c.companyId !== w.companyId) return false;
            if (w.segmentId && c.segmentId !== w.segmentId) return false;
            if (w.paymentCondition && c.paymentCondition !== w.paymentCondition) {
              return false;
            }
            if (w.OR) {
              const hit = w.OR.some((clause) =>
                Object.entries(clause).some(([field, cond]) =>
                  String(c[field] ?? "")
                    .toLowerCase()
                    .includes(cond.contains.toLowerCase()),
                ),
              );
              if (!hit) return false;
            }
            return true;
          });

          if (!select) {
            return filtered;
          }

          const KNOWN_SELECT_KEYS = [
            "id",
            "legalName",
            "displayName",
            "taxId",
            "phone",
            "email",
            "city",
            "department",
            "creditLimit",
            "paymentCondition",
            "paymentDays",
            "active",
            "segment",
            "company",
            "contacts",
          ];

          for (const key of Object.keys(select)) {
            if (select[key] && !KNOWN_SELECT_KEYS.includes(key)) {
              throw new Error(
                `customer.findMany stub: campo de select no soportado "${key}". Enséñale el campo al stub antes de usarlo.`,
              );
            }
          }

          return filtered.map((c) => {
            const record = c as Record<string, unknown>;
            const projected: Record<string, unknown> = {};
            for (const key of KNOWN_SELECT_KEYS) {
              if (select[key]) {
                projected[key] = record[key];
              }
            }
            return projected;
          });
        },
```

- [ ] **Step 2: Escribir los tests que fallan**

Agregar al final del `describe("Customers", ...)` (antes del `afterAll` si existe, si no al final del bloque) un `describe` nuevo. Las fixtures se empujan DIRECTO al array `customers` (no vía POST: así no dependen del flujo de creación y controlan `active`/`company` exactamente). Los asserts filtran por el prefijo `FILTRO-` para no chocar con clientes creados por otros tests del mismo archivo:

```typescript
  describe("GET /customers con filtros", () => {
    const filterFixtures = [
      {
        id: "filtro-alfa-id",
        legalName: "FILTRO-ALFA SAS",
        displayName: "FILTRO-ALFA",
        taxId: "900111222-3",
        phone: null,
        email: null,
        city: "Bogota",
        department: "Cundinamarca",
        creditLimit: null,
        paymentCondition: "contado",
        paymentDays: 0,
        active: true,
        companyId: "company-filtros-a",
        company: { id: "company-filtros-a", name: "Norgtech" },
        segmentId: "segment-bronze",
        segment: { id: "segment-bronze", name: "Bronce" },
        contacts: [],
      },
      {
        id: "filtro-beta-id",
        legalName: "FILTRO-BETA LTDA",
        displayName: "FILTRO-BETA",
        taxId: "800333444-5",
        phone: null,
        email: null,
        city: "Cali",
        department: "Valle",
        creditLimit: null,
        paymentCondition: "credito_30",
        paymentDays: 30,
        active: true,
        companyId: "company-filtros-b",
        company: { id: "company-filtros-b", name: "Nanonutricion" },
        segmentId: "segment-silver",
        segment: { id: "segment-silver", name: "Plata" },
        contacts: [],
      },
      {
        id: "filtro-gamma-id",
        legalName: "FILTRO-GAMMA SA",
        displayName: "FILTRO-GAMMA",
        taxId: "700555666-7",
        phone: null,
        email: null,
        city: "Medellin",
        department: "Antioquia",
        creditLimit: null,
        paymentCondition: "contado",
        paymentDays: 0,
        active: false,
        companyId: "company-filtros-a",
        company: { id: "company-filtros-a", name: "Norgtech" },
        segmentId: "segment-bronze",
        segment: { id: "segment-bronze", name: "Bronce" },
        contacts: [],
      },
    ];

    beforeAll(() => {
      customers.push(...filterFixtures);
    });

    afterAll(() => {
      for (const fixture of filterFixtures) {
        const index = customers.findIndex((c) => c.id === fixture.id);
        if (index >= 0) customers.splice(index, 1);
      }
    });

    const namesOf = (body: Array<{ legalName: string }>) =>
      body
        .map((c) => c.legalName)
        .filter((name) => name.startsWith("FILTRO-"))
        .sort();

    it("search encuentra por nombre sin importar mayusculas", async () => {
      const response = await request(app.getHttpServer())
        .get("/customers?search=filtro-alfa&includeInactive=true")
        .set("Authorization", `Bearer ${global.__ADMIN_TOKEN__}`)
        .expect(200);

      expect(namesOf(response.body)).toEqual(["FILTRO-ALFA SAS"]);
    });

    it("search encuentra por NIT", async () => {
      const response = await request(app.getHttpServer())
        .get("/customers?search=800333444&includeInactive=true")
        .set("Authorization", `Bearer ${global.__ADMIN_TOKEN__}`)
        .expect(200);

      expect(namesOf(response.body)).toEqual(["FILTRO-BETA LTDA"]);
    });

    it("companyId filtra por empresa", async () => {
      const response = await request(app.getHttpServer())
        .get("/customers?companyId=company-filtros-b&includeInactive=true")
        .set("Authorization", `Bearer ${global.__ADMIN_TOKEN__}`)
        .expect(200);

      expect(namesOf(response.body)).toEqual(["FILTRO-BETA LTDA"]);
    });

    it("segmentId filtra por segmento", async () => {
      const response = await request(app.getHttpServer())
        .get("/customers?segmentId=segment-silver&includeInactive=true")
        .set("Authorization", `Bearer ${global.__ADMIN_TOKEN__}`)
        .expect(200);

      expect(namesOf(response.body)).toEqual(["FILTRO-BETA LTDA"]);
    });

    it("paymentCondition filtra por condicion de pago", async () => {
      const response = await request(app.getHttpServer())
        .get("/customers?paymentCondition=credito_30&includeInactive=true")
        .set("Authorization", `Bearer ${global.__ADMIN_TOKEN__}`)
        .expect(200);

      expect(namesOf(response.body)).toEqual(["FILTRO-BETA LTDA"]);
    });

    it("paymentCondition invalida responde 400", async () => {
      await request(app.getHttpServer())
        .get("/customers?paymentCondition=credito_45")
        .set("Authorization", `Bearer ${global.__ADMIN_TOKEN__}`)
        .expect(400);
    });

    it("active=false trae solo inactivos y manda sobre includeInactive", async () => {
      const response = await request(app.getHttpServer())
        .get("/customers?active=false")
        .set("Authorization", `Bearer ${global.__ADMIN_TOKEN__}`)
        .expect(200);

      expect(namesOf(response.body)).toEqual(["FILTRO-GAMMA SA"]);
    });

    it("los filtros se combinan con AND", async () => {
      const response = await request(app.getHttpServer())
        .get("/customers?companyId=company-filtros-a&search=FILTRO&includeInactive=true")
        .set("Authorization", `Bearer ${global.__ADMIN_TOKEN__}`)
        .expect(200);

      expect(namesOf(response.body)).toEqual([
        "FILTRO-ALFA SAS",
        "FILTRO-GAMMA SA",
      ]);
    });

    it("sin params nuevos el default sigue siendo solo activos", async () => {
      const response = await request(app.getHttpServer())
        .get("/customers")
        .set("Authorization", `Bearer ${global.__ADMIN_TOKEN__}`)
        .expect(200);

      const names = namesOf(response.body);
      expect(names).toContain("FILTRO-ALFA SAS");
      expect(names).not.toContain("FILTRO-GAMMA SA");
    });
  });
```

Nota sobre el test de `active=false`: si `@Transform` convirtiera un param ausente en `false` (comportamiento conocido de class-transformer con propiedades no presentes), el test "sin params nuevos el default sigue siendo solo activos" lo detecta: la respuesta traería solo inactivos. Por eso el transform del DTO (Step 4) preserva `undefined`.

- [ ] **Step 3: Correr los tests y verificar que fallan**

```bash
cd apps/api && npx jest --watchman=false --config ./test/jest-e2e.json -t "filtros"
```

Expected: FAIL. Los tests de `search`/`companyId`/`segmentId`/`paymentCondition` fallan porque el endpoint ignora los params (whitelist del ValidationPipe los descarta) y devuelve también las otras fixtures; el de `paymentCondition` inválida falla porque responde 200.

- [ ] **Step 4: Crear el DTO**

Crear `apps/api/src/modules/customers/dto/list-customers.query.dto.ts`:

```typescript
import { PaymentCondition } from "@prisma/client";
import { Transform } from "class-transformer";
import { IsBoolean, IsEnum, IsOptional, IsString } from "class-validator";
import { IncludeInactiveQueryDto } from "../../../common/dto/include-inactive.query";

/**
 * Filtros opcionales del listado de clientes. Todos componibles (AND).
 * `active` explicito manda sobre `includeInactive`; sin `active`, el
 * comportamiento historico de `includeInactive` queda intacto.
 */
export class ListCustomersQueryDto extends IncludeInactiveQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  segmentId?: string;

  @IsOptional()
  @IsEnum(PaymentCondition)
  paymentCondition?: PaymentCondition;

  // El ternario preserva undefined: class-transformer corre @Transform aun
  // cuando el param no vino, y un `undefined === "true"` colapsaria a false
  // (= filtrar solo inactivos) el caso "sin filtro".
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined ? undefined : value === true || value === "true",
  )
  @IsBoolean()
  active?: boolean;
}
```

- [ ] **Step 5: Cablear controller y service**

En `apps/api/src/modules/customers/customers.controller.ts`, importar el DTO nuevo y cambiar `findAll`:

```typescript
import { ListCustomersQueryDto } from "./dto/list-customers.query.dto";
```

```typescript
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "comercial", "director_comercial", "tecnico", "facturacion", "logistica")
  @Get()
  findAll(
    @Query(new ValidationPipe({ transform: true, whitelist: true })) query: ListCustomersQueryDto,
  ) {
    return this.customersService.findAll(query);
  }
```

(`IncludeInactiveQueryDto` deja de importarse en este controller si ya no lo usa nadie más ahí; verificar y limpiar el import.)

En `apps/api/src/modules/customers/customers.service.ts`, importar el DTO y reemplazar la firma y el `where` de `findAll` (el `select`/`orderBy` no cambian):

```typescript
import { ListCustomersQueryDto } from "./dto/list-customers.query.dto";
```

```typescript
  findAll(query: ListCustomersQueryDto = {}) {
    const { includeInactive, search, companyId, segmentId, paymentCondition, active } = query;

    const where: Prisma.CustomerWhereInput = {};
    if (active !== undefined) {
      where.active = active;
    } else if (!includeInactive) {
      where.active = true;
    }
    if (companyId) where.companyId = companyId;
    if (segmentId) where.segmentId = segmentId;
    if (paymentCondition) where.paymentCondition = paymentCondition;
    if (search) {
      where.OR = [
        { displayName: { contains: search, mode: "insensitive" } },
        { legalName: { contains: search, mode: "insensitive" } },
        { taxId: { contains: search, mode: "insensitive" } },
      ];
    }

    return this.prisma.customer.findMany({
      where,
      select: {
        // ... select existente sin cambios ...
      },
      orderBy: { displayName: "asc" },
    });
  }
```

Ojo: `Prisma` ya se importa en el service (`import { Prisma, ... } from "@prisma/client"`); si no, agregarlo. El `where` ahora siempre es un objeto (antes era `undefined` con includeInactive); el stub del Step 1 acepta `{}` vacío.

- [ ] **Step 6: Correr los tests de filtros y verificar que pasan**

```bash
cd apps/api && npx jest --watchman=false --config ./test/jest-e2e.json -t "filtros"
```

Expected: PASS (9 tests).

- [ ] **Step 7: Correr el spec completo de customers (regresión)**

```bash
cd apps/api && npx jest --watchman=false --config ./test/jest-e2e.json customers.e2e-spec
```

Expected: PASS completo — los tests previos del listado (`includeInactive`, empresa en el listado, paymentCondition expuesto) no cambian de resultado.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/customers apps/api/test/customers.e2e-spec.ts
git commit -m "feat(clientes): filtros por query param en GET /customers"
```

---

### Task 2: Controles de filtro en la lista web de clientes

**Files:**
- Create: `apps/web/src/lib/query-string.ts`
- Create: `apps/web/src/components/customers/customers-filters.tsx`
- Modify: `apps/web/src/lib/labels.ts` (agregar `PAYMENT_LABELS` y `paymentLabel`)
- Modify: `apps/web/src/app/(app)/customers/page.tsx`

**Interfaces:**
- Consumes: query params de Task 1 (`search`, `companyId`, `segmentId`, `paymentCondition`, `active`, `includeInactive`); endpoints existentes `GET /companies` y `GET /customer-segments` (devuelven `{ id, name }[]` de activos); `FilterBar` (`children`, `summary`, `actions`); `Input` de `@/components/ui/input`.
- Produces: `buildQueryString(params: Record<string, string | string[] | undefined>): string` en `@/lib/query-string`; `PAYMENT_LABELS: Record<string, string>` y `paymentLabel(condition: string | null): string` en `@/lib/labels`; componente `<CustomersFilters companies segments shown total />`.

- [ ] **Step 1: Extraer `buildQueryString` a lib**

Crear `apps/web/src/lib/query-string.ts` (misma implementación que ya viven duplicadas en `invoices/page.tsx:87` y `expenses/page.tsx:107`; esas dos páginas NO se tocan en esta feature):

```typescript
/**
 * Serializa los searchParams de un server component a query string,
 * omitiendo undefined y repitiendo claves para valores multiples.
 */
export function buildQueryString(
  params: Record<string, string | string[] | undefined>,
): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined) return;
    if (Array.isArray(value)) {
      value.forEach((item) => query.append(key, item));
      return;
    }
    query.set(key, value);
  });
  return query.toString();
}
```

- [ ] **Step 2: Mover `PAYMENT_LABELS`/`paymentLabel` a `lib/labels.ts`**

En `apps/web/src/lib/labels.ts` agregar (al final, con su sección):

```typescript
// --- Clientes ---------------------------------------------------------------

export const PAYMENT_LABELS: Record<string, string> = {
  contado: "Contado",
  credito_15: "Crédito 15 días",
  credito_30: "Crédito 30 días",
  credito_60: "Crédito 60 días",
  credito_90: "Crédito 90 días",
};

export function paymentLabel(condition: string | null): string {
  if (!condition) return "Contado";
  return PAYMENT_LABELS[condition] ?? condition;
}
```

En `apps/web/src/app/(app)/customers/page.tsx` borrar el `PAYMENT_LABELS` y `paymentLabel` locales e importar:

```typescript
import { paymentLabel } from "@/lib/labels";
```

- [ ] **Step 3: Crear el componente cliente de filtros**

Crear `apps/web/src/components/customers/customers-filters.tsx`:

```typescript
"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FilterBar } from "@/components/ui/filter-bar";
import { Input } from "@/components/ui/input";
import { PAYMENT_LABELS } from "@/lib/labels";

interface Option {
  id: string;
  name: string;
}

interface CustomersFiltersProps {
  companies: Option[];
  segments: Option[];
  /** Filas visibles con los filtros aplicados. */
  shown: number;
  /** Total de clientes sin filtrar (para el resumen "N de M"). */
  total: number;
}

const selectClasses =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

const FILTER_KEYS = ["search", "companyId", "active", "segmentId", "paymentCondition"] as const;

export function CustomersFilters({ companies, segments, shown, total }: CustomersFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.replace(params.size ? `${pathname}?${params.toString()}` : pathname);
  };

  const onSearchChange = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setParam("search", value.trim()), 300);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const hasFilters = FILTER_KEYS.some((key) => searchParams.get(key));
  const summary = hasFilters
    ? `${shown.toLocaleString("es-CO")} de ${total.toLocaleString("es-CO")} clientes`
    : `${total.toLocaleString("es-CO")} clientes registrados`;

  return (
    <FilterBar
      summary={summary}
      actions={
        hasFilters ? (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              router.replace(pathname);
            }}
            className="h-8 rounded-lg border border-input px-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Limpiar
          </button>
        ) : null
      }
    >
      <Input
        type="search"
        placeholder="Buscar por nombre, razón social o NIT"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        className="w-64"
        aria-label="Buscar clientes"
      />
      <select
        aria-label="Filtrar por empresa"
        className={selectClasses}
        value={searchParams.get("companyId") ?? ""}
        onChange={(event) => setParam("companyId", event.target.value)}
      >
        <option value="">Todas las empresas</option>
        {companies.map((company) => (
          <option key={company.id} value={company.id}>
            {company.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Filtrar por estado"
        className={selectClasses}
        value={searchParams.get("active") ?? ""}
        onChange={(event) => setParam("active", event.target.value)}
      >
        <option value="">Todos los estados</option>
        <option value="true">Activos</option>
        <option value="false">Inactivos</option>
      </select>
      <select
        aria-label="Filtrar por segmento"
        className={selectClasses}
        value={searchParams.get("segmentId") ?? ""}
        onChange={(event) => setParam("segmentId", event.target.value)}
      >
        <option value="">Todos los segmentos</option>
        {segments.map((segment) => (
          <option key={segment.id} value={segment.id}>
            {segment.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Filtrar por pago"
        className={selectClasses}
        value={searchParams.get("paymentCondition") ?? ""}
        onChange={(event) => setParam("paymentCondition", event.target.value)}
      >
        <option value="">Todas las formas de pago</option>
        {Object.entries(PAYMENT_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </FilterBar>
  );
}
```

- [ ] **Step 4: Cablear la página**

En `apps/web/src/app/(app)/customers/page.tsx`:

1. Imports: quitar `FilterBar` (lo renderiza ahora `CustomersFilters`), agregar:

```typescript
import { CustomersFilters } from "@/components/customers/customers-filters";
import { buildQueryString } from "@/lib/query-string";
import { paymentLabel } from "@/lib/labels";
```

2. Reemplazar la firma del componente y el fetch:

```typescript
export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const userRole = user?.role ?? null;

  // Sin filtro de estado explicito la lista muestra Todos (activos+inactivos),
  // igual que antes de los filtros.
  const single = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const apiParams: Record<string, string | undefined> = {
    search: single("search") || undefined,
    companyId: single("companyId") || undefined,
    segmentId: single("segmentId") || undefined,
    paymentCondition: single("paymentCondition") || undefined,
    active: single("active") || undefined,
  };
  if (apiParams.active === undefined) {
    apiParams.includeInactive = "true";
  }
  const queryString = buildQueryString(apiParams);

  const [response, companiesResponse, segmentsResponse] = await Promise.all([
    apiFetch(`/customers?${queryString}`),
    apiFetch("/companies"),
    apiFetch("/customer-segments"),
  ]);

  const customers: Customer[] = response.ok ? await response.json() : [];
  const companies: { id: string; name: string }[] = companiesResponse.ok
    ? await companiesResponse.json()
    : [];
  const segments: { id: string; name: string }[] = segmentsResponse.ok
    ? await segmentsResponse.json()
    : [];

  const hasFilters = Object.entries(apiParams).some(
    ([key, value]) => key !== "includeInactive" && value !== undefined,
  );
  // "N de M": el total sin filtrar solo se necesita (y se consulta) cuando hay
  // filtros activos. ponytail: segunda consulta completa; endpoint de conteo
  // cuando la tabla crezca.
  let total = customers.length;
  if (hasFilters) {
    const totalResponse = await apiFetch("/customers?includeInactive=true");
    const all: unknown[] = totalResponse.ok ? await totalResponse.json() : [];
    total = all.length;
  }
```

3. El mapeo a `rows` no cambia. En el JSX, reemplazar la línea `<FilterBar summary={...} />` por:

```tsx
      <CustomersFilters
        companies={companies}
        segments={segments}
        shown={rows.length}
        total={total}
      />
```

- [ ] **Step 5: Verificar tipos**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep -v "tests/e2e"
```

Expected: sin salida (cero errores fuera de `tests/e2e/`).

- [ ] **Step 6: Verificación manual contra el API local**

Con el API corriendo (o contra la dev remota si está configurada), en el navegador: `/customers?companyId=<id de Nanonutrición>` debe mostrar 12 filas y el resumen "12 de 518 clientes"; escribir en el buscador debe actualizar la URL tras ~300 ms; "Limpiar" vuelve a `/customers` con los 518. Si no hay entorno corriendo, dejar constancia en el reporte de que la verificación manual queda pendiente del usuario.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/query-string.ts apps/web/src/lib/labels.ts "apps/web/src/components/customers/customers-filters.tsx" "apps/web/src/app/(app)/customers/page.tsx"
git commit -m "feat(clientes): controles de filtro en la lista de clientes"
```
