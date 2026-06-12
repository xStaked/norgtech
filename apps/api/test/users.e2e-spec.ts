import { INestApplication, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { Prisma, UserRole } from "@prisma/client";
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
    for (const user of response.body) {
      expect(user).not.toHaveProperty("passwordHash");
    }
    expect(JSON.stringify(response.body)).not.toContain("passwordHash");
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
