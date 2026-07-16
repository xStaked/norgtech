import {
  INestApplication,
  UnauthorizedException,
} from "@nestjs/common";
import { TestingModule, Test } from "@nestjs/testing";
import { UserRole } from "@prisma/client";
import { JwtStrategy } from "../src/modules/auth/jwt.strategy";
import request from "supertest";
import cookieParser from "cookie-parser";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

declare global {
  // eslint-disable-next-line no-var
  var __APP__: ReturnType<INestApplication["getHttpServer"]> | undefined;
}

describe("Auth", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let refreshStore: Array<{
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    revokedAt: Date | null;
  }>;
  let refreshIdCounter: number;
  const passwordHash = "$2a$10$eHlBtTx4HDVGtfsH8BSxG.JwwXsYNrKcdePOt3.1/./NPQ0CHs.w2";

  const mockUsers = [
    { email: "admin@norgtech.com", role: UserRole.administrador, active: true },
    { email: "director@norgtech.com", role: UserRole.director_comercial, active: true },
    { email: "comercial@norgtech.com", role: UserRole.comercial, active: true },
    { email: "tecnico@norgtech.com", role: UserRole.tecnico, active: true },
    { email: "facturacion@norgtech.com", role: UserRole.facturacion, active: true },
    { email: "logistica@norgtech.com", role: UserRole.logistica, active: true },
    { email: "inactive@norgtech.com", role: UserRole.administrador, active: false },
  ];

  beforeAll(async () => {
    refreshStore = [];
    refreshIdCounter = 0;

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        billingRequest: {
          findMany: async () => [],
        },
        commercialExpense: {
          findMany: async () => [],
        },
        refreshToken: {
          create: async ({
            data,
          }: {
            data: { userId: string; tokenHash: string; expiresAt: Date };
          }) => {
            const record = {
              id: `token-${refreshIdCounter++}`,
              userId: data.userId,
              tokenHash: data.tokenHash,
              expiresAt: data.expiresAt,
              revokedAt: null,
            };
            refreshStore.push(record);
            return record;
          },
          findUnique: async ({ where: { tokenHash } }: { where: { tokenHash: string } }) =>
            refreshStore.find((r) => r.tokenHash === tokenHash) ?? null,
          update: async ({
            where: { id },
            data,
          }: {
            where: { id: string };
            data: { revokedAt: Date };
          }) => {
            const record = refreshStore.find((r) => r.id === id);
            if (!record) throw new Error("not found");
            record.revokedAt = data.revokedAt;
            return record;
          },
          updateMany: async ({
            where,
            data,
          }: {
            where: { tokenHash: string; revokedAt: null };
            data: { revokedAt: Date };
          }) => {
            const matches = refreshStore.filter(
              (r) => r.tokenHash === where.tokenHash && r.revokedAt === where.revokedAt,
            );
            matches.forEach((r) => (r.revokedAt = data.revokedAt));
            return { count: matches.length };
          },
        },
        user: {
          findUnique: async ({
            where: { id, email },
          }: {
            where: { id?: string; email?: string };
          }) => {
            if (email) {
              const user = mockUsers.find((u) => u.email === email);
              if (!user) return null;
              return {
                id: `${user.role}-user-id`,
                name: user.role,
                email: user.email,
                passwordHash,
                role: user.role,
                active: user.active,
              };
            }
            if (id) {
              const user = mockUsers.find((u) => `${u.role}-user-id` === id);
              if (!user) return null;
              return {
                id: `${user.role}-user-id`,
                name: user.role,
                email: user.email,
                passwordHash,
                role: user.role,
                active: user.active,
              };
            }
            return null;
          },
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    globalThis.__APP__ = app.getHttpServer();
  });

  afterAll(async () => {
    globalThis.__APP__ = undefined;
    if (app) {
      await app.close();
    }
  });

  it.each(mockUsers.filter((u) => u.active))(
    "POST /auth/login returns a bearer token for $role",
    async ({ email, role }) => {
      const response = await request(globalThis.__APP__)
        .post("/auth/login")
        .send({ email, password: "Admin123*" })
        .expect(200);

      expect(response.body.accessToken).toEqual(expect.any(String));
      expect(response.body.user.role).toBe(role);
    },
  );

  it("POST /auth/login rejects invalid payloads before auth lookup", async () => {
    await request(globalThis.__APP__)
      .post("/auth/login")
      .send({ email: "not-an-email" })
      .expect(400);
  });

  it("POST /auth/login rejects inactive users", async () => {
    await request(globalThis.__APP__)
      .post("/auth/login")
      .send({ email: "inactive@norgtech.com", password: "Admin123*" })
      .expect(401);
  });

  it("POST /auth/login sets an httpOnly refresh_token cookie and omits refreshToken from the body", async () => {
    const response = await request(globalThis.__APP__)
      .post("/auth/login")
      .send({ email: "admin@norgtech.com", password: "Admin123*" })
      .expect(200);

    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.refreshToken).toBeUndefined();

    const setCookie = response.headers["set-cookie"] as unknown as string[];
    expect(setCookie).toBeDefined();
    const refreshCookie = setCookie.find((c) => c.startsWith("refresh_token="));
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toMatch(/HttpOnly/i);
  });

  it("POST /auth/refresh with the login cookie returns a new accessToken and rotates the cookie", async () => {
    const loginResponse = await request(globalThis.__APP__)
      .post("/auth/login")
      .send({ email: "admin@norgtech.com", password: "Admin123*" })
      .expect(200);

    const loginCookies = loginResponse.headers["set-cookie"] as unknown as string[];
    const loginRefreshCookie = loginCookies
      .find((c) => c.startsWith("refresh_token="))!
      .split(";")[0];

    const refreshResponse = await request(globalThis.__APP__)
      .post("/auth/refresh")
      .set("Cookie", loginRefreshCookie)
      .expect(200);

    expect(refreshResponse.body.accessToken).toEqual(expect.any(String));
    expect(refreshResponse.body.refreshToken).toBeUndefined();

    const refreshCookies = refreshResponse.headers["set-cookie"] as unknown as string[];
    expect(refreshCookies).toBeDefined();
    const rotatedCookie = refreshCookies.find((c) => c.startsWith("refresh_token="))!;
    expect(rotatedCookie).toMatch(/HttpOnly/i);
    expect(rotatedCookie.split(";")[0]).not.toEqual(loginRefreshCookie);

    // reusing the old (now rotated/revoked) cookie must fail
    await request(globalThis.__APP__)
      .post("/auth/refresh")
      .set("Cookie", loginRefreshCookie)
      .expect(401);
  });

  it("POST /auth/refresh without a cookie returns 401 Sesión expirada", async () => {
    const response = await request(globalThis.__APP__)
      .post("/auth/refresh")
      .expect(401);

    expect(response.body.message).toBe("Sesión expirada");
  });

  it("POST /auth/logout clears the cookie and revokes it so a later refresh with it fails", async () => {
    const loginResponse = await request(globalThis.__APP__)
      .post("/auth/login")
      .send({ email: "admin@norgtech.com", password: "Admin123*" })
      .expect(200);

    const loginRefreshCookie = (loginResponse.headers["set-cookie"] as unknown as string[])
      .find((c) => c.startsWith("refresh_token="))!
      .split(";")[0];

    const logoutResponse = await request(globalThis.__APP__)
      .post("/auth/logout")
      .set("Cookie", loginRefreshCookie)
      .expect(200);

    expect(logoutResponse.body).toEqual({ ok: true });
    const logoutCookies = logoutResponse.headers["set-cookie"] as unknown as string[];
    expect(logoutCookies).toBeDefined();
    const clearedCookie = logoutCookies.find((c) => c.startsWith("refresh_token="))!;
    expect(clearedCookie).toMatch(/refresh_token=;/);

    await request(globalThis.__APP__)
      .post("/auth/refresh")
      .set("Cookie", loginRefreshCookie)
      .expect(401);
  });

  it("GET /auth/me returns current user for valid token", async () => {
    const loginResponse = await request(globalThis.__APP__)
      .post("/auth/login")
      .send({ email: "admin@norgtech.com", password: "Admin123*" })
      .expect(200);

    const token = loginResponse.body.accessToken as string;

    const meResponse = await request(globalThis.__APP__)
      .get("/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(meResponse.body).toMatchObject({
      id: expect.any(String),
      email: "admin@norgtech.com",
      role: "administrador",
    });
  });

  it("GET /billing-requests returns 403 for tecnico", async () => {
    const loginResponse = await request(globalThis.__APP__)
      .post("/auth/login")
      .send({ email: "tecnico@norgtech.com", password: "Admin123*" })
      .expect(200);

    const token = loginResponse.body.accessToken as string;

    await request(globalThis.__APP__)
      .get("/billing-requests")
      .set("Authorization", `Bearer ${token}`)
      .expect(403);
  });

  it("GET /billing-requests returns 200 for facturacion", async () => {
    const loginResponse = await request(globalThis.__APP__)
      .post("/auth/login")
      .send({ email: "facturacion@norgtech.com", password: "Admin123*" })
      .expect(200);

    const token = loginResponse.body.accessToken as string;

    await request(globalThis.__APP__)
      .get("/billing-requests")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
  });

  it("GET /commercial-expenses returns 200 for comercial", async () => {
    const loginResponse = await request(globalThis.__APP__)
      .post("/auth/login")
      .send({ email: "comercial@norgtech.com", password: "Admin123*" })
      .expect(200);

    const token = loginResponse.body.accessToken as string;

    await request(globalThis.__APP__)
      .get("/commercial-expenses")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
  });

  it("GET /commercial-expenses returns 403 for logistica", async () => {
    const loginResponse = await request(globalThis.__APP__)
      .post("/auth/login")
      .send({ email: "logistica@norgtech.com", password: "Admin123*" })
      .expect(200);

    const token = loginResponse.body.accessToken as string;

    await request(globalThis.__APP__)
      .get("/commercial-expenses")
      .set("Authorization", `Bearer ${token}`)
      .expect(403);
  });

  it("JwtStrategy rejects bearer tokens with invalid payload shape", () => {
    const invalidShapeToken =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImFkbWluQG5vcmd0ZWNoLmxvY2FsIn0.rFzMGRDwQOG-hv8Bga7iEmDe4op4gQTCiRffCeXnhnw";
    const jwtStrategy = moduleRef.get(JwtStrategy);

    expect(() => jwtStrategy.verify(invalidShapeToken)).toThrow(
      UnauthorizedException,
    );
  });
});
