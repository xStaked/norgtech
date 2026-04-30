import {
  INestApplication,
  UnauthorizedException,
} from "@nestjs/common";
import { TestingModule, Test } from "@nestjs/testing";
import { UserRole } from "@prisma/client";
import { JwtStrategy } from "../src/modules/auth/jwt.strategy";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

declare global {
  // eslint-disable-next-line no-var
  var __APP__: ReturnType<INestApplication["getHttpServer"]> | undefined;
}

describe("Auth", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
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
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        billingRequest: {
          findMany: async () => [],
        },
        user: {
          findUnique: async ({ where: { email } }: { where: { email: string } }) => {
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
          },
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
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

  it("JwtStrategy rejects bearer tokens with invalid payload shape", () => {
    const invalidShapeToken =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImFkbWluQG5vcmd0ZWNoLmxvY2FsIn0.rFzMGRDwQOG-hv8Bga7iEmDe4op4gQTCiRffCeXnhnw";
    const jwtStrategy = moduleRef.get(JwtStrategy);

    expect(() => jwtStrategy.verify(invalidShapeToken)).toThrow(
      UnauthorizedException,
    );
  });
});
