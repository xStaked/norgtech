import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { UserRole } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

declare global {
  // eslint-disable-next-line no-var
  var __APP__: ReturnType<INestApplication["getHttpServer"]> | undefined;
  // eslint-disable-next-line no-var
  var __ADMIN_TOKEN__: string | undefined;
}

describe("Customer segments", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  const passwordHash = "$2a$10$eHlBtTx4HDVGtfsH8BSxG.JwwXsYNrKcdePOt3.1/./NPQ0CHs.w2";
  const customerSegment = {
    create: async ({
      data,
    }: {
      data: {
        name: string;
        description?: string;
        createdBy: string;
        updatedBy: string;
      };
    }) => ({
      id: "segment-id",
      active: true,
      createdAt: new Date("2026-04-29T00:00:00.000Z"),
      updatedAt: new Date("2026-04-29T00:00:00.000Z"),
      ...data,
    }),
  };

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
                  role: UserRole.administrador,
                  active: true,
                }
              : null,
        },
        customerSegment,
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    globalThis.__APP__ = app.getHttpServer();

    const loginResponse = await request(globalThis.__APP__)
      .post("/auth/login")
      .send({ email: "admin@norgtech.local", password: "Admin123*" })
      .expect(200);

    globalThis.__ADMIN_TOKEN__ = loginResponse.body.accessToken;
  });

  afterAll(async () => {
    globalThis.__ADMIN_TOKEN__ = undefined;
    globalThis.__APP__ = undefined;

    if (app) {
      await app.close();
    }
  });

  it("allows an admin to create a segment", async () => {
    await request(globalThis.__APP__)
      .post("/customer-segments")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ name: "Oro", description: "Clientes de alto valor" })
      .expect(201);
  });
});
