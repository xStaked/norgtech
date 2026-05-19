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
  const passwordHash =
    "$2a$10$eHlBtTx4HDVGtfsH8BSxG.JwwXsYNrKcdePOt3.1/./NPQ0CHs.w2";
  const segments: Array<Record<string, unknown>> = [
    {
      id: "segment-with-customers",
      name: "Con Clientes",
      description: "Segmento con clientes asignados",
      discountPercent: 5,
      minGoalAmount: 0,
      maxGoalAmount: null,
      active: true,
      createdBy: "admin-user-id",
      updatedBy: "admin-user-id",
      createdAt: new Date("2026-04-29T00:00:00.000Z"),
      updatedAt: new Date("2026-04-29T00:00:00.000Z"),
    },
  ];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        user: {
          findUnique: async ({
            where: { email },
          }: {
            where: { email: string };
          }) =>
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
        customerSegment: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            const segment = {
              id: `segment-${segments.length + 1}`,
              ...data,
              createdAt: new Date("2026-04-29T00:00:00.000Z"),
              updatedAt: new Date("2026-04-29T00:00:00.000Z"),
            };
            segments.push(segment);
            return segment;
          },
          findMany: async () =>
            [...segments].sort((a, b) =>
              (a as { name: string }).name.localeCompare(
                (b as { name: string }).name,
              ),
            ),
          findUnique: async ({
            where: { id },
          }: {
            where: { id: string };
          }) => segments.find((s) => (s as { id: string }).id === id) ?? null,
          update: async ({
            where: { id },
            data,
          }: {
            where: { id: string };
            data: Record<string, unknown>;
          }) => {
            const index = segments.findIndex(
              (s) => (s as { id: string }).id === id,
            );
            if (index === -1) {
              return null;
            }
            segments[index] = {
              ...segments[index],
              ...data,
              updatedAt: new Date("2026-04-29T00:00:00.000Z"),
            };
            return segments[index];
          },
          delete: async ({
            where: { id },
          }: {
            where: { id: string };
          }) => {
            const index = segments.findIndex(
              (s) => (s as { id: string }).id === id,
            );
            if (index === -1) {
              return null;
            }
            const removed = segments[index];
            segments.splice(index, 1);
            return removed;
          },
        },
        customer: {
          count: async ({ where }: { where?: { segmentId?: string } }) => {
            if (where?.segmentId === "segment-with-customers") {
              return 2;
            }
            return 0;
          },
        },
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

  it("allows an admin to create a segment with discount and goal amounts", async () => {
    const response = await request(globalThis.__APP__)
      .post("/customer-segments")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        name: "Oro",
        description: "Clientes de alto valor",
        discountPercent: 8,
        minGoalAmount: 150000000,
        maxGoalAmount: 300000000,
      })
      .expect(201);

    expect(response.body.name).toBe("Oro");
    expect(response.body.discountPercent).toBe(8);
    expect(response.body.minGoalAmount).toBe(150000000);
    expect(response.body.maxGoalAmount).toBe(300000000);
  });

  it("lists segments", async () => {
    const response = await request(globalThis.__APP__)
      .get("/customer-segments")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThanOrEqual(1);
  });

  it("gets a segment by id", async () => {
    const createResponse = await request(globalThis.__APP__)
      .post("/customer-segments")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        name: "Plata",
        description: "Clientes con potencial",
        discountPercent: 5,
        minGoalAmount: 50000000,
        maxGoalAmount: 150000000,
      })
      .expect(201);

    const response = await request(globalThis.__APP__)
      .get(`/customer-segments/${createResponse.body.id}`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(200);

    expect(response.body.id).toBe(createResponse.body.id);
    expect(response.body.name).toBe("Plata");
  });

  it("returns 404 for nonexistent segment", async () => {
    await request(globalThis.__APP__)
      .get("/customer-segments/nonexistent-id")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(404);
  });

  it("updates a segment", async () => {
    const createResponse = await request(globalThis.__APP__)
      .post("/customer-segments")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        name: "Bronce",
        description: "Clientes nuevos",
        discountPercent: 3,
        minGoalAmount: 0,
        maxGoalAmount: 50000000,
      })
      .expect(201);

    const response = await request(globalThis.__APP__)
      .patch(`/customer-segments/${createResponse.body.id}`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        discountPercent: 4,
        maxGoalAmount: 60000000,
      })
      .expect(200);

    expect(response.body.discountPercent).toBe(4);
    expect(response.body.maxGoalAmount).toBe(60000000);
  });

  it("deletes a segment without customers", async () => {
    const createResponse = await request(globalThis.__APP__)
      .post("/customer-segments")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        name: "Retail",
        description: "Cadenas de tiendas",
        discountPercent: 4,
        minGoalAmount: 0,
        maxGoalAmount: 100000000,
      })
      .expect(201);

    await request(globalThis.__APP__)
      .delete(`/customer-segments/${createResponse.body.id}`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(200);

    await request(globalThis.__APP__)
      .get(`/customer-segments/${createResponse.body.id}`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(404);
  });

  it("rejects deleting a segment with assigned customers", async () => {
    await request(globalThis.__APP__)
      .delete("/customer-segments/segment-with-customers")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(400);
  });

  it("rejects negative discountPercent", async () => {
    await request(globalThis.__APP__)
      .post("/customer-segments")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        name: "Negativo",
        discountPercent: -1,
        minGoalAmount: 0,
      })
      .expect(400);
  });

  it("rejects discountPercent greater than 100", async () => {
    await request(globalThis.__APP__)
      .post("/customer-segments")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        name: "Exceso",
        discountPercent: 101,
        minGoalAmount: 0,
      })
      .expect(400);
  });

  it("rejects maxGoalAmount less than or equal to minGoalAmount", async () => {
    await request(globalThis.__APP__)
      .post("/customer-segments")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        name: "RangoInvalido",
        discountPercent: 5,
        minGoalAmount: 100000,
        maxGoalAmount: 100000,
      })
      .expect(400);
  });
});
