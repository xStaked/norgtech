import { INestApplication, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { Prisma, UserRole } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { refreshTokenStub } from "./helpers/login-as";

type MockUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  passwordHash: string;
  role: UserRole;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type MockUserSelect = Partial<Record<keyof MockUser, boolean>>;
const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} satisfies MockUserSelect;

function applySelect<T extends MockUserSelect | undefined>(
  user: MockUser | null,
  select?: T,
) {
  if (!user) {
    return null;
  }

  if (!select) {
    return user;
  }

  const selectedEntries = Object.entries(select)
    .filter(([, enabled]) => enabled)
    .map(([key]) => [key, user[key as keyof MockUser]]);

  return Object.fromEntries(selectedEntries) as Partial<MockUser>;
}

describe("Users", () => {
  let app: INestApplication;
  const passwordHash = "$2a$10$eHlBtTx4HDVGtfsH8BSxG.JwwXsYNrKcdePOt3.1/./NPQ0CHs.w2";
  const users = new Map<string, MockUser>();
  let lastFindUniqueArgs:
    | { where: { id?: string; email?: string }; select?: MockUserSelect }
    | undefined;
  let lastFindManyArgs:
    | { where?: { active?: boolean }; orderBy?: { name?: "asc" | "desc" }; select?: MockUserSelect }
    | undefined;
  let lastCreateArgs:
    | {
        data: { name: string; email: string; phone: string; passwordHash: string; role: UserRole; active: boolean };
        select?: MockUserSelect;
      }
    | undefined;
  let lastUpdateArgs:
    | {
        where: { id: string };
        data: Partial<MockUser>;
        select?: MockUserSelect;
      }
    | undefined;

  const prismaMock = {
    billingRequest: { findMany: async () => [] },
    commercialExpense: { findMany: async () => [] },
    user: {
      findUnique: async ({
        where,
        select,
      }: {
        where: { id?: string; email?: string };
        select?: MockUserSelect;
      }) => {
        lastFindUniqueArgs = { where, select };
        const user = where.id
          ? users.get(where.id) ?? null
          : where.email
            ? Array.from(users.values()).find((u) => u.email === where.email) ?? null
            : null;

        return applySelect(user, select);
      },
      findMany: async ({
        where,
        orderBy,
        select,
      }: {
        where?: { active?: boolean };
        orderBy?: { name?: "asc" | "desc" };
        select?: MockUserSelect;
      }) => {
        lastFindManyArgs = { where, orderBy, select };

        // Honors the `where.active` filter so the includeInactive e2e below is
        // real: GET /users passes `where: { active: true }` by default and
        // `where: undefined` when includeInactive is set.
        const result = Array.from(users.values()).filter(
          (u) => where?.active === undefined || u.active === where.active,
        );
        if (orderBy?.name === "asc") {
          result.sort((a, b) => a.name.localeCompare(b.name));
        }
        if (orderBy?.name === "desc") {
          result.sort((a, b) => b.name.localeCompare(a.name));
        }

        return result.map((user) => applySelect(user, select));
      },
      create: async ({
        data,
        select,
      }: {
        data: { name: string; email: string; phone: string; passwordHash: string; role: UserRole; active: boolean };
        select?: MockUserSelect;
      }) => {
        lastCreateArgs = { data, select };
        if (Array.from(users.values()).some((u) => u.email === data.email)) {
          throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed on the fields: (`email`)", {
            code: "P2002",
            clientVersion: "test",
            meta: { target: ["email"] },
          });
        }
        const now = new Date("2026-06-11T12:00:00.000Z");
        const created: MockUser = {
          id: `user-${users.size + 1}`,
          name: data.name,
          email: data.email,
          phone: data.phone,
          passwordHash: data.passwordHash,
          role: data.role,
          active: data.active,
          createdAt: now,
          updatedAt: now,
        };
        users.set(created.id, created);
        return applySelect(created, select);
      },
      update: async ({
        where,
        data,
        select,
      }: {
        where: { id: string };
        data: Partial<MockUser>;
        select?: MockUserSelect;
      }) => {
        lastUpdateArgs = { where, data, select };
        const existing = users.get(where.id);
        if (!existing) throw new NotFoundException("User not found");
        const updated = { ...existing, ...data, updatedAt: new Date("2026-06-11T13:00:00.000Z") };
        users.set(where.id, updated);
        return applySelect(updated, select);
      },
    },
    refreshToken: refreshTokenStub(),
  };

  beforeEach(() => {
    users.clear();
    lastFindUniqueArgs = undefined;
    lastFindManyArgs = undefined;
    lastCreateArgs = undefined;
    lastUpdateArgs = undefined;
    const now = new Date("2026-06-11T10:00:00.000Z");
    users.set("commercial-id", {
      id: "commercial-id",
      name: "Comercial",
      email: "comercial@norgtech.com",
      phone: "+573001000003",
      passwordHash,
      role: UserRole.comercial,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    users.set("admin-id", {
      id: "admin-id",
      name: "Administrador",
      email: "admin@norgtech.com",
      phone: "+573001000001",
      passwordHash,
      role: UserRole.administrador,
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
    expect(response.body[0]).toMatchObject({
      email: "admin@norgtech.com",
      phone: "+573001000001",
      role: "administrador",
    });
    expect(response.body.map((user: { name: string }) => user.name)).toEqual(["Administrador", "Comercial"]);
    expect(lastFindManyArgs?.orderBy).toEqual({ name: "asc" });
    expect(lastFindManyArgs?.select).toEqual(publicUserSelect);
    for (const user of response.body) {
      expect(user).not.toHaveProperty("passwordHash");
      expect(typeof user.phone).toBe("string");
    }
    expect(JSON.stringify(response.body)).not.toContain("passwordHash");
  });

  // ZON-01/COM-01 family: a deactivated user must not silently disappear from
  // the admin list, but only when the caller opts in. GET /users/sellers (the
  // seller selector) stays active-only regardless.
  it("excludes inactive users from the default list but includes them with includeInactive", async () => {
    const now = new Date("2026-06-11T10:00:00.000Z");
    users.set("inactive-id", {
      id: "inactive-id",
      name: "Inactivo",
      email: "inactivo@norgtech.com",
      phone: "+573001000099",
      passwordHash,
      role: UserRole.comercial,
      active: false,
      createdAt: now,
      updatedAt: now,
    });

    const token = await login("admin@norgtech.com");

    const defaultResponse = await request(app.getHttpServer())
      .get("/users")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const defaultIds = (defaultResponse.body as Array<{ id: string }>).map((u) => u.id);
    expect(defaultIds).not.toContain("inactive-id");
    expect(lastFindManyArgs?.where).toEqual({ active: true });

    const inclusiveResponse = await request(app.getHttpServer())
      .get("/users?includeInactive=true")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const inclusiveIds = (inclusiveResponse.body as Array<{ id: string }>).map((u) => u.id);
    expect(inclusiveIds).toContain("inactive-id");
    expect(lastFindManyArgs?.where).toBeUndefined();
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
      .send({
        name: "Diana Facturacion",
        email: "DIANA@NORGTECH.COM ",
        phone: " +573001000007 ",
        role: "facturacion",
      })
      .expect(201);

    expect(createResponse.body.user).toMatchObject({
      name: "Diana Facturacion",
      email: "diana@norgtech.com",
      phone: "+573001000007",
      role: "facturacion",
      active: true,
    });
    expect(createResponse.body.user).not.toHaveProperty("passwordHash");
    expect(createResponse.body.temporaryPassword).toEqual(expect.any(String));
    expect(createResponse.body.temporaryPassword.length).toBeGreaterThanOrEqual(12);
    expect(lastCreateArgs?.select).toEqual(publicUserSelect);
    expect(lastCreateArgs?.data.phone).toBe("+573001000007");

    await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "diana@norgtech.com", password: createResponse.body.temporaryPassword })
      .expect(200);
  });

  it("rejects invalid phone when creating a user", async () => {
    const token = await login("admin@norgtech.com");

    await request(app.getHttpServer())
      .post("/users")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Diana Facturacion",
        email: "diana@norgtech.com",
        phone: "3001000007",
        role: "facturacion",
      })
      .expect(400);
  });

  it("rejects duplicate emails", async () => {
    const token = await login("admin@norgtech.com");

    await request(app.getHttpServer())
      .post("/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Admin Copy", email: "ADMIN@NORGTECH.COM", phone: "+573001000009", role: "administrador" })
      .expect(409);
  });

  it("updates another user role, name, and active state", async () => {
    const token = await login("admin@norgtech.com");

    const response = await request(app.getHttpServer())
      .patch("/users/commercial-id")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Comercial Senior", phone: "+573001000008", role: "director_comercial", active: false })
      .expect(200);

    expect(response.body).toMatchObject({
      id: "commercial-id",
      name: "Comercial Senior",
      phone: "+573001000008",
      role: "director_comercial",
      active: false,
    });
    expect(response.body).not.toHaveProperty("passwordHash");
    expect(lastFindUniqueArgs).toEqual({
      where: { id: "commercial-id" },
      select: { id: true, role: true },
    });
    expect(lastUpdateArgs?.select).toEqual(publicUserSelect);
    expect(lastUpdateArgs?.data.phone).toBe("+573001000008");
  });

  it("rejects invalid phone when updating a user", async () => {
    const token = await login("admin@norgtech.com");

    await request(app.getHttpServer())
      .patch("/users/commercial-id")
      .set("Authorization", `Bearer ${token}`)
      .send({ phone: "3001000008" })
      .expect(400);
  });

  it("rejects null phone when updating a user", async () => {
    const token = await login("admin@norgtech.com");

    await request(app.getHttpServer())
      .patch("/users/commercial-id")
      .set("Authorization", `Bearer ${token}`)
      .send({ phone: null })
      .expect(400);

    expect(lastUpdateArgs).toBeUndefined();
    expect(users.get("commercial-id")?.phone).toBe("+573001000003");
  });

  it("returns 404 when updating a nonexistent user", async () => {
    const token = await login("admin@norgtech.com");

    await request(app.getHttpServer())
      .patch("/users/missing-id")
      .set("Authorization", `Bearer ${token}`)
      .send({ active: false })
      .expect(404);

    expect(lastFindUniqueArgs).toEqual({
      where: { id: "missing-id" },
      select: { id: true, role: true },
    });
  });

  it("rejects patch payloads with email", async () => {
    const token = await login("admin@norgtech.com");

    await request(app.getHttpServer())
      .patch("/users/commercial-id")
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "new@norgtech.com" })
      .expect(400);

    expect(users.get("commercial-id")?.email).toBe("comercial@norgtech.com");
  });

  it("rejects patch payloads with passwordHash", async () => {
    const token = await login("admin@norgtech.com");

    await request(app.getHttpServer())
      .patch("/users/commercial-id")
      .set("Authorization", `Bearer ${token}`)
      .send({ passwordHash: "tampered" })
      .expect(400);

    expect(users.get("commercial-id")?.passwordHash).toBe(passwordHash);
  });

  it("does not allow an admin to change their own role", async () => {
    const token = await login("admin@norgtech.com");

    await request(app.getHttpServer())
      .patch("/users/admin-id")
      .set("Authorization", `Bearer ${token}`)
      .send({ role: "comercial" })
      .expect(400);

    expect(users.get("admin-id")?.role).toBe(UserRole.administrador);
  });

  it("does not allow an admin to patch their own role even if unchanged", async () => {
    const token = await login("admin@norgtech.com");

    await request(app.getHttpServer())
      .patch("/users/admin-id")
      .set("Authorization", `Bearer ${token}`)
      .send({ role: "administrador" })
      .expect(400);

    expect(users.get("admin-id")?.role).toBe(UserRole.administrador);
  });

  it("does not allow an admin to deactivate themself", async () => {
    const token = await login("admin@norgtech.com");

    await request(app.getHttpServer())
      .patch("/users/admin-id")
      .set("Authorization", `Bearer ${token}`)
      .send({ active: false })
      .expect(400);

    expect(users.get("admin-id")?.active).toBe(true);
  });
});
