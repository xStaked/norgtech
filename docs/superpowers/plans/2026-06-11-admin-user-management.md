# Admin User Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an administrator-only user management module for listing, creating, and updating CRM users with backend-generated temporary passwords.

**Architecture:** Add a focused NestJS `UsersModule` backed by the existing Prisma `User` model, protected by existing JWT and role guards. Add a Next.js `/users` admin page that uses existing API helpers, updates role-based navigation, and renders create/edit controls without exposing password hashes.

**Tech Stack:** NestJS, Prisma, class-validator, bcryptjs, jsonwebtoken, Jest/Supertest e2e tests, Next.js App Router, React client components, Playwright.

---

## File Structure

- Create `apps/api/src/modules/users/dto/create-user.dto.ts`: validates create payload.
- Create `apps/api/src/modules/users/dto/update-user.dto.ts`: validates partial update payload.
- Create `apps/api/src/modules/users/users.service.ts`: user listing, creation, temp password generation, public serialization, update rules.
- Create `apps/api/src/modules/users/users.controller.ts`: guarded `/users` endpoints.
- Create `apps/api/src/modules/users/users.module.ts`: wires service/controller.
- Modify `apps/api/src/app.module.ts`: imports `UsersModule`.
- Create `apps/api/test/users.e2e-spec.ts`: API security and behavior tests.
- Modify `apps/web/src/lib/auth.ts`: adds `/users` access for admin.
- Modify `apps/web/src/lib/theme.ts`: adds `Admin` nav group and `Usuarios` item.
- Modify `apps/web/src/components/sidebar-nav.tsx`: keeps new group rendering with existing filtering.
- Create `apps/web/src/components/users/user-management-client.tsx`: client-side create/edit interactions.
- Create `apps/web/src/app/(app)/users/page.tsx`: server-side page load and access handoff.
- Use `apps/web/tests/e2e/auth.spec.ts` as the current web e2e pattern reference. This plan uses build verification plus manual authenticated checks because the existing Playwright setup only covers unauthenticated redirect behavior and has no API mocking/authenticated fixture.

---

### Task 1: API User Module Tests

**Files:**
- Create: `apps/api/test/users.e2e-spec.ts`

- [ ] **Step 1: Write failing e2e tests**

Create `apps/api/test/users.e2e-spec.ts`:

```ts
import { ConflictException, INestApplication, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { UserRole } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

type MockUser = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

describe("Users", () => {
  let app: INestApplication;
  const passwordHash = "$2a$10$eHlBtTx4HDVGtfsH8BSxG.JwwXsYNrKcdePOt3.1/./NPQ0CHs.w2";
  const users = new Map<string, MockUser>();

  const prismaMock = {
    billingRequest: { findMany: async () => [] },
    commercialExpense: { findMany: async () => [] },
    user: {
      findUnique: async ({ where }: { where: { id?: string; email?: string } }) => {
        if (where.id) return users.get(where.id) ?? null;
        if (where.email) return Array.from(users.values()).find((u) => u.email === where.email) ?? null;
        return null;
      },
      findMany: async () =>
        Array.from(users.values()).sort((a, b) => a.name.localeCompare(b.name)),
      create: async ({ data }: { data: { name: string; email: string; passwordHash: string; role: UserRole; active: boolean } }) => {
        if (Array.from(users.values()).some((u) => u.email === data.email)) {
          throw new ConflictException("Email already exists");
        }
        const now = new Date("2026-06-11T12:00:00.000Z");
        const created: MockUser = {
          id: `user-${users.size + 1}`,
          name: data.name,
          email: data.email,
          passwordHash: data.passwordHash,
          role: data.role,
          active: data.active,
          createdAt: now,
          updatedAt: now,
        };
        users.set(created.id, created);
        return created;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<MockUser> }) => {
        const existing = users.get(where.id);
        if (!existing) throw new NotFoundException("User not found");
        const updated = { ...existing, ...data, updatedAt: new Date("2026-06-11T13:00:00.000Z") };
        users.set(where.id, updated);
        return updated;
      },
    },
  };

  beforeEach(() => {
    users.clear();
    const now = new Date("2026-06-11T10:00:00.000Z");
    users.set("admin-id", {
      id: "admin-id",
      name: "Administrador",
      email: "admin@norgtech.com",
      passwordHash,
      role: UserRole.administrador,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    users.set("commercial-id", {
      id: "commercial-id",
      name: "Comercial",
      email: "comercial@norgtech.com",
      passwordHash,
      role: UserRole.comercial,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  });

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  async function login(email: string) {
    const response = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email, password: "Admin123*" })
      .expect(200);

    return response.body.accessToken as string;
  }

  it("allows administrador to list users without passwordHash", async () => {
    const token = await login("admin@norgtech.com");

    const response = await request(app.getHttpServer())
      .get("/users")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body).toHaveLength(2);
    expect(response.body[0]).toMatchObject({ email: "admin@norgtech.com", role: "administrador" });
    expect(response.body[0]).not.toHaveProperty("passwordHash");
  });

  it("rejects non-admin access", async () => {
    const token = await login("comercial@norgtech.com");

    await request(app.getHttpServer())
      .get("/users")
      .set("Authorization", `Bearer ${token}`)
      .expect(403);
  });

  it("creates a user with a temporary password that can be used to login", async () => {
    const token = await login("admin@norgtech.com");

    const createResponse = await request(app.getHttpServer())
      .post("/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Diana Facturacion", email: "DIANA@NORGTECH.COM ", role: "facturacion" })
      .expect(201);

    expect(createResponse.body.user).toMatchObject({
      name: "Diana Facturacion",
      email: "diana@norgtech.com",
      role: "facturacion",
      active: true,
    });
    expect(createResponse.body.user).not.toHaveProperty("passwordHash");
    expect(createResponse.body.temporaryPassword).toEqual(expect.any(String));
    expect(createResponse.body.temporaryPassword.length).toBeGreaterThanOrEqual(12);

    await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "diana@norgtech.com", password: createResponse.body.temporaryPassword })
      .expect(200);
  });

  it("rejects duplicate emails", async () => {
    const token = await login("admin@norgtech.com");

    await request(app.getHttpServer())
      .post("/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Admin Copy", email: "ADMIN@NORGTECH.COM", role: "administrador" })
      .expect(409);
  });

  it("updates another user role, name, and active state", async () => {
    const token = await login("admin@norgtech.com");

    const response = await request(app.getHttpServer())
      .patch("/users/commercial-id")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Comercial Senior", role: "director_comercial", active: false })
      .expect(200);

    expect(response.body).toMatchObject({
      id: "commercial-id",
      name: "Comercial Senior",
      role: "director_comercial",
      active: false,
    });
    expect(response.body).not.toHaveProperty("passwordHash");
  });

  it("does not allow an admin to change their own role", async () => {
    const token = await login("admin@norgtech.com");

    await request(app.getHttpServer())
      .patch("/users/admin-id")
      .set("Authorization", `Bearer ${token}`)
      .send({ role: "comercial" })
      .expect(400);
  });

  it("does not allow an admin to deactivate themself", async () => {
    const token = await login("admin@norgtech.com");

    await request(app.getHttpServer())
      .patch("/users/admin-id")
      .set("Authorization", `Bearer ${token}`)
      .send({ active: false })
      .expect(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @norgtech/api test -- users.e2e-spec.ts
```

Expected: FAIL with routing/module errors for `/users`, because `UsersModule` does not exist yet.

- [ ] **Step 3: Commit failing tests**

```bash
git add apps/api/test/users.e2e-spec.ts
git commit -m "test(api): cover admin user management"
```

---

### Task 2: API User Module Implementation

**Files:**
- Create: `apps/api/src/modules/users/dto/create-user.dto.ts`
- Create: `apps/api/src/modules/users/dto/update-user.dto.ts`
- Create: `apps/api/src/modules/users/users.service.ts`
- Create: `apps/api/src/modules/users/users.controller.ts`
- Create: `apps/api/src/modules/users/users.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/users.e2e-spec.ts`

- [ ] **Step 1: Add DTOs**

Create `apps/api/src/modules/users/dto/create-user.dto.ts`:

```ts
import { UserRole } from "@prisma/client";
import { IsEmail, IsEnum, IsNotEmpty, IsString, Matches } from "class-validator";

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  name!: string;

  @IsEmail()
  @IsNotEmpty()
  @IsString()
  email!: string;

  @IsEnum(UserRole)
  role!: UserRole;
}
```

Create `apps/api/src/modules/users/dto/update-user.dto.ts`:

```ts
import { UserRole } from "@prisma/client";
import { IsBoolean, IsEnum, IsOptional, IsString, Matches } from "class-validator";

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @Matches(/\S/)
  name?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
```

- [ ] **Step 2: Add service**

Create `apps/api/src/modules/users/users.service.ts`:

```ts
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, User } from "@prisma/client";
import { randomBytes } from "crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthUser } from "../auth/types/authenticated-request";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

type BcryptModule = {
  hash(value: string, rounds: number): Promise<string>;
};

const bcrypt = require("bcryptjs") as BcryptModule;

type PublicUser = Omit<User, "passwordHash">;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<PublicUser[]> {
    const users = await this.prisma.user.findMany({
      orderBy: { name: "asc" },
    });

    return users.map((user) => this.toPublicUser(user));
  }

  async create(dto: CreateUserDto) {
    const email = this.normalizeEmail(dto.email);
    const temporaryPassword = this.generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);

    try {
      const user = await this.prisma.user.create({
        data: {
          name: dto.name.trim(),
          email,
          passwordHash,
          role: dto.role,
          active: true,
        },
      });

      return {
        user: this.toPublicUser(user),
        temporaryPassword,
      };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException("Email already exists");
      }
      throw error;
    }
  }

  async update(currentUser: AuthUser, id: string, dto: UpdateUserDto): Promise<PublicUser> {
    const existing = await this.prisma.user.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException("User not found");
    }

    if (currentUser.id === id && dto.role && dto.role !== existing.role) {
      throw new BadRequestException("You cannot change your own role");
    }

    if (currentUser.id === id && dto.active === false) {
      throw new BadRequestException("You cannot deactivate your own user");
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });

    return this.toPublicUser(user);
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private generateTemporaryPassword() {
    return `Nt-${randomBytes(9).toString("base64url")}`;
  }

  private toPublicUser(user: User): PublicUser {
    const { passwordHash: _passwordHash, ...publicUser } = user;
    return publicUser;
  }

  private isUniqueConstraintError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
  }
}
```

- [ ] **Step 3: Add controller and module**

Create `apps/api/src/modules/users/users.controller.ts`:

```ts
import { Body, Controller, Get, Param, Patch, Post, UseGuards, ValidationPipe } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { AuthUser } from "../auth/types/authenticated-request";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UsersService } from "./users.service";

const validationPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
});

@Controller("users")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("administrador")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Post()
  create(@Body(validationPipe) dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(validationPipe) dto: UpdateUserDto,
  ) {
    return this.usersService.update(user, id, dto);
  }
}
```

Create `apps/api/src/modules/users/users.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  imports: [PrismaModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
```

- [ ] **Step 4: Register module**

Modify `apps/api/src/app.module.ts`:

```ts
import { UsersModule } from "./modules/users/users.module";
```

Add `UsersModule` to the `imports` array near `AuthModule`.

- [ ] **Step 5: Run API tests**

Run:

```bash
pnpm --filter @norgtech/api test -- users.e2e-spec.ts auth.e2e-spec.ts
```

Expected: PASS for user module and existing auth/role guard behavior.

- [ ] **Step 6: Commit API implementation**

```bash
git add apps/api/src/app.module.ts apps/api/src/modules/users apps/api/test/users.e2e-spec.ts
git commit -m "feat(api): add admin user management endpoints"
```

---

### Task 3: Web Navigation and Access Wiring

**Files:**
- Modify: `apps/web/src/lib/auth.ts`
- Modify: `apps/web/src/lib/theme.ts`
- Modify: `apps/web/src/components/sidebar-nav.tsx`

- [ ] **Step 1: Add `/users` access**

Modify `apps/web/src/lib/auth.ts` inside `moduleAccess`:

```ts
"/users": ["administrador"],
```

- [ ] **Step 2: Add Admin group and Usuarios nav item**

Modify `apps/web/src/lib/theme.ts`:

```ts
export interface NavItem {
  href: string;
  label: string;
  shortLabel: string;
  description: string;
  group: "Operacion" | "Comercial" | "Catalogo" | "Admin";
  requiredRoles: readonly UserRole[];
}
```

Add to `primaryNavItems`:

```ts
{
  href: "/users",
  label: "Usuarios",
  shortLabel: "US",
  description: "Altas, roles y estado de acceso",
  group: "Admin",
  requiredRoles: ["administrador"] as const,
},
```

Add to `navGroups`:

```ts
{
  label: "Admin",
  items: primaryNavItems.filter((item) => item.group === "Admin"),
},
```

Add to `singularLabels`:

```ts
Usuarios: "Usuario",
```

- [ ] **Step 3: Verify Nora injection still works with Admin group**

Keep `filterNavGroups` in `apps/web/src/components/sidebar-nav.tsx` as:

```ts
function filterNavGroups(role: UserRole) {
  const groupsWithNora = navGroups.map((group) =>
    group.label === "Operacion"
      ? { ...group, items: [...group.items, noraNavItem] }
      : group,
  );

  return groupsWithNora
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.requiredRoles.includes(role)),
    }))
    .filter((group) => group.items.length > 0);
}
```

- [ ] **Step 4: Run web type/build check**

Run:

```bash
pnpm --filter @norgtech/web build
```

Expected: PASS.

- [ ] **Step 5: Commit navigation wiring**

```bash
git add apps/web/src/lib/auth.ts apps/web/src/lib/theme.ts apps/web/src/components/sidebar-nav.tsx
git commit -m "feat(web): add admin users navigation"
```

---

### Task 4: Web Users Page and Client Component

**Files:**
- Create: `apps/web/src/components/users/user-management-client.tsx`
- Create: `apps/web/src/app/(app)/users/page.tsx`

- [ ] **Step 1: Create client component**

Create `apps/web/src/components/users/user-management-client.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchClient } from "@/lib/api.client";
import type { UserRole } from "@/lib/auth";
import { USER_ROLES } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CreateResponse {
  user: ManagedUser;
  temporaryPassword: string;
}

const roleLabels: Record<UserRole, string> = {
  administrador: "Administrador",
  director_comercial: "Director comercial",
  comercial: "Comercial",
  tecnico: "Tecnico",
  facturacion: "Facturacion",
  logistica: "Logistica",
};

export function UserManagementClient({
  users,
  currentUserId,
}: {
  users: ManagedUser[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => a.name.localeCompare(b.name)),
    [users],
  );

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setTemporaryPassword(null);
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const body = {
      name: String(formData.get("name") || ""),
      email: String(formData.get("email") || ""),
      role: String(formData.get("role") || ""),
    };

    try {
      const response = await apiFetchClient("/users", {
        method: "POST",
        body: JSON.stringify(body),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.message || "No se pudo crear el usuario");
        return;
      }

      setTemporaryPassword((data as CreateResponse).temporaryPassword);
      event.currentTarget.reset();
      router.refresh();
    } catch {
      setError("Error de conexion");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdate(userId: string, body: Partial<Pick<ManagedUser, "name" | "role" | "active">>) {
    setError(null);
    const response = await apiFetchClient(`/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.message || "No se pudo actualizar el usuario");
      return;
    }

    router.refresh();
  }

  return (
    <div className="grid gap-6">
      <form onSubmit={handleCreate} className="grid gap-4 rounded-lg border bg-card p-4">
        <div>
          <h2 className="text-base font-semibold">Nuevo usuario</h2>
          <p className="text-sm text-muted-foreground">
            El sistema generara una contrasena temporal al crear la cuenta.
          </p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {temporaryPassword && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="font-semibold">Contrasena temporal</div>
            <code className="mt-1 block select-all rounded bg-white px-2 py-1">{temporaryPassword}</code>
            <div className="mt-1 text-xs">Esta contrasena solo se muestra una vez.</div>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-3">
          <div className="grid gap-1">
            <Label>Nombre</Label>
            <Input name="name" required />
          </div>
          <div className="grid gap-1">
            <Label>Email</Label>
            <Input name="email" type="email" required />
          </div>
          <div className="grid gap-1">
            <Label>Rol</Label>
            <select
              name="role"
              required
              defaultValue="comercial"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              {USER_ROLES.map((role) => (
                <option key={role} value={role}>
                  {roleLabels[role]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <Button type="submit" disabled={loading}>
            {loading ? "Creando..." : "Crear usuario"}
          </Button>
        </div>
      </form>

      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left">
            <tr>
              <th className="px-4 py-3 font-semibold">Usuario</th>
              <th className="px-4 py-3 font-semibold">Rol</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
              <th className="px-4 py-3 font-semibold">Actualizado</th>
            </tr>
          </thead>
          <tbody>
            {sortedUsers.map((user) => {
              const isCurrentUser = user.id === currentUserId;
              return (
                <tr key={user.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <Input
                      aria-label={`Nombre de ${user.email}`}
                      defaultValue={user.name}
                      onBlur={(event) => {
                        const nextName = event.currentTarget.value.trim();
                        if (nextName && nextName !== user.name) {
                          void handleUpdate(user.id, { name: nextName });
                        }
                      }}
                    />
                    <div className="mt-1 text-xs text-muted-foreground">{user.email}</div>
                    {isCurrentUser && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        No puedes quitar tu propio acceso de administrador desde aqui.
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      aria-label={`Rol de ${user.email}`}
                      value={user.role}
                      disabled={isCurrentUser}
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                      onChange={(event) => void handleUpdate(user.id, { role: event.currentTarget.value as UserRole })}
                    >
                      {USER_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {roleLabels[role]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={isCurrentUser}
                      onClick={() => void handleUpdate(user.id, { active: !user.active })}
                    >
                      {user.active ? "Desactivar" : "Activar"}
                    </Button>
                    <Badge className="ml-2" variant={user.active ? "default" : "secondary"}>
                      {user.active ? "Activo" : "Inactivo"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(user.updatedAt).toLocaleDateString("es-CO")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create server page**

Create `apps/web/src/app/(app)/users/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { UserManagementClient, type ManagedUser } from "@/components/users/user-management-client";
import { apiFetch } from "@/lib/api.server";
import { getCurrentUser } from "@/lib/auth.server";

export default async function UsersPage() {
  const currentUser = await getCurrentUser();

  if (!currentUser || currentUser.role !== "administrador") {
    redirect("/dashboard");
  }

  const response = await apiFetch("/users");
  const users: ManagedUser[] = response.ok ? await response.json() : [];

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Usuarios</h1>
        <p className="text-sm text-muted-foreground">
          Administra altas, roles y estado de acceso del CRM.
        </p>
      </div>

      <UserManagementClient users={users} currentUserId={currentUser.id} />
    </div>
  );
}
```

- [ ] **Step 3: Run web build**

Run:

```bash
pnpm --filter @norgtech/web build
```

Expected: PASS.

- [ ] **Step 4: Commit users UI**

```bash
git add 'apps/web/src/app/(app)/users/page.tsx' apps/web/src/components/users/user-management-client.tsx
git commit -m "feat(web): add admin user management page"
```

---

### Task 5: Verification and Polish

**Files:**
- Test: `apps/api/test/users.e2e-spec.ts`
- Modify: only files needed to fix verified failures.

- [ ] **Step 1: Run focused API verification**

Run:

```bash
pnpm --filter @norgtech/api test -- users.e2e-spec.ts auth.e2e-spec.ts
```

Expected: PASS.

- [ ] **Step 2: Run frontend build verification**

Run:

```bash
pnpm --filter @norgtech/web build
```

Expected: PASS.

- [ ] **Step 3: Manual authenticated browser verification**

Start the dev servers:

```bash
pnpm --filter @norgtech/api dev
pnpm --filter @norgtech/web dev
```

Manual checks:

- Login as `admin@norgtech.com`.
- Sidebar shows `Admin > Usuarios`.
- `/users` lists seeded users.
- Creating a user displays a temporary password.
- The new user can login with that temporary password.
- Current admin row disables role and deactivate controls.
- Login as `comercial@norgtech.com`; sidebar does not show `Usuarios`.

- [ ] **Step 4: Final status**

Run:

```bash
git status --short
```

Expected: only intentional changes remain. If all implementation changes were committed task-by-task, the working tree should only include unrelated pre-existing files such as `GASTOS SEMANA 18-19 OTROS.xlsx`.
