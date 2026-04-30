import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { UserRole } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

declare global {
  // eslint-disable-next-line no-var
  var __APP__: ReturnType<INestApplication["getHttpServer"]> | undefined;
}

describe("Auth", () => {
  let app: INestApplication;
  const passwordHash = "$2a$10$eHlBtTx4HDVGtfsH8BSxG.JwwXsYNrKcdePOt3.1/./NPQ0CHs.w2";

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
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
    await app.close();
  });

  it("POST /auth/login returns a bearer token for seeded admin", async () => {
    const response = await request(globalThis.__APP__)
      .post("/auth/login")
      .send({ email: "admin@norgtech.local", password: "Admin123*" })
      .expect(200);

    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.user.role).toBe("admin");
  });
});
