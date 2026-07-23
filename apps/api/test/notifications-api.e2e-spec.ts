import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { NotificationType, UserRole } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  authHeader,
  findMockUserByEmail,
  loginAs,
  MOCK_USERS,
  refreshTokenStub,
} from "./helpers/login-as";

describe("Notifications API", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;

  const comercialId = MOCK_USERS[UserRole.comercial].id;
  const otroId = MOCK_USERS[UserRole.tecnico].id;

  let rows: Array<Record<string, unknown>>;

  beforeEach(async () => {
    rows = [
      {
        id: "n-1",
        userId: comercialId,
        type: NotificationType.pedido_hito,
        title: "Pedido NN-1 paso a facturado",
        body: null,
        entityType: "order",
        entityId: "order-1",
        dedupeKey: "k1",
        readAt: null,
        createdAt: new Date("2026-07-20T10:00:00.000Z"),
      },
      {
        id: "n-2",
        userId: otroId,
        type: NotificationType.visita_vencida,
        title: "Visita vencida",
        body: null,
        entityType: "visit",
        entityId: "visit-1",
        dedupeKey: "k2",
        readAt: null,
        createdAt: new Date("2026-07-21T10:00:00.000Z"),
      },
    ];

    const prismaStub = {
      user: {
        findUnique: async ({ where }: { where: { email?: string } }) =>
          findMockUserByEmail(where.email),
        findMany: async () => [],
      },
      refreshToken: refreshTokenStub(),
      notification: {
        findMany: async ({
          where,
          take,
        }: {
          where: { userId: string; readAt?: null };
          take?: number;
        }) => {
          const result = rows.filter(
            (r) =>
              r.userId === where.userId &&
              (where.readAt === undefined || r.readAt === null),
          );
          return take ? result.slice(0, take) : result;
        },
        count: async ({ where }: { where: { userId: string } }) =>
          rows.filter((r) => r.userId === where.userId && r.readAt === null)
            .length,
        updateMany: async ({
          where,
          data,
        }: {
          where: { id?: string; userId: string; readAt?: null };
          data: { readAt: Date };
        }) => {
          const target = rows.filter(
            (r) =>
              r.userId === where.userId &&
              (where.id === undefined || r.id === where.id) &&
              r.readAt === null,
          );
          for (const row of target) row.readAt = data.readAt;
          return { count: target.length };
        },
        deleteMany: async () => ({ count: 0 }),
      },
    };

    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaStub)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it("solo devuelve las notificaciones del usuario autenticado", async () => {
    const token = await loginAs(app, UserRole.comercial);

    const response = await request(app.getHttpServer())
      .get("/notifications")
      .set(authHeader(token))
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].id).toBe("n-1");
  });

  it("cuenta solo las no leidas propias", async () => {
    const token = await loginAs(app, UserRole.comercial);

    const response = await request(app.getHttpServer())
      .get("/notifications/unread-count")
      .set(authHeader(token))
      .expect(200);

    expect(response.body).toEqual({ count: 1 });
  });

  it("no deja marcar como leida una notificacion ajena", async () => {
    const token = await loginAs(app, UserRole.comercial);

    await request(app.getHttpServer())
      .patch("/notifications/n-2/read")
      .set(authHeader(token))
      .expect(404);

    expect(rows[1].readAt).toBeNull();
  });

  it("marca todas las propias como leidas", async () => {
    const token = await loginAs(app, UserRole.comercial);

    await request(app.getHttpServer())
      .post("/notifications/read-all")
      .set(authHeader(token))
      .expect(201);

    expect(rows[0].readAt).not.toBeNull();
    expect(rows[1].readAt).toBeNull();
  });

  it("rechaza sin token", async () => {
    await request(app.getHttpServer()).get("/notifications").expect(401);
  });
});
