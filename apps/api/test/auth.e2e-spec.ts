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

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        user: {
          findUnique: async ({ where: { email } }: { where: { email: string } }) =>
            email === "admin@norgtech.local"
              ? {
                  id: "admin-user-id",
                  name: "Admin",
                  email: "admin@norgtech.local",
                  passwordHash,
                  role: UserRole.admin,
                  active: true,
                }
              : email === "inactive@norgtech.local"
                ? {
                    id: "inactive-user-id",
                    name: "Inactive",
                    email: "inactive@norgtech.local",
                    passwordHash,
                    role: UserRole.admin,
                    active: false,
                  }
              : null,
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

  it("POST /auth/login returns a bearer token for seeded admin", async () => {
    const response = await request(globalThis.__APP__)
      .post("/auth/login")
      .send({ email: "admin@norgtech.local", password: "Admin123*" })
      .expect(200);

    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.user.role).toBe("admin");
  });

  it("POST /auth/login rejects invalid payloads before auth lookup", async () => {
    await request(globalThis.__APP__)
      .post("/auth/login")
      .send({ email: "not-an-email" })
      .expect(400);
  });

  it("POST /auth/login rejects inactive users", async () => {
    await request(globalThis.__APP__)
      .post("/auth/login")
      .send({ email: "inactive@norgtech.local", password: "Admin123*" })
      .expect(401);
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
