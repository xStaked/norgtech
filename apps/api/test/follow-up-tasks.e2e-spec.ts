import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { FollowUpTaskStatus, FollowUpTaskType, UserRole } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

declare global {
  // eslint-disable-next-line no-var
  var __APP__: ReturnType<INestApplication["getHttpServer"]> | undefined;
  // eslint-disable-next-line no-var
  var __ADMIN_TOKEN__: string | undefined;
}

describe("FollowUpTasks", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  const passwordHash = "$2a$10$eHlBtTx4HDVGtfsH8BSxG.JwwXsYNrKcdePOt3.1/./NPQ0CHs.w2";
  const tasks: Array<Record<string, unknown>> = [];
  const auditLogs: Array<Record<string, unknown>> = [];

  beforeAll(async () => {
    const user = {
      findUnique: async ({ where }: { where: { email?: string; id?: string } }) => {
        if (where.email === "admin@norgtech.local") {
          return {
            id: "admin-user-id",
            name: "Admin",
            email: "admin@norgtech.local",
            passwordHash,
            role: UserRole.administrador,
            active: true,
          };
        }
        return null;
      },
    };

    const customer = {
      findUnique: async ({ where }: { where: { id: string } }) => {
        if (where.id === "customer-1") {
          return {
            id: "customer-1",
            displayName: "Cliente Test",
          };
        }
        return null;
      },
    };

    const prismaStub = {
      user,
      customer,
      followUpTask: {
        create: async () => {
          throw new Error("followUpTask.create must run inside a transaction");
        },
        findUnique: async ({ where }: { where: { id: string } }) => {
          return tasks.find((t) => t.id === where.id) ?? null;
        },
        findMany: async ({ where }: { where?: Record<string, unknown> }) => {
          let result = [...tasks];
          if (where?.status) {
            result = result.filter((t) => t.status === where.status);
          }
          if (where?.assignedToUserId) {
            result = result.filter((t) => t.assignedToUserId === where.assignedToUserId);
          }
          if (where?.dueAt && typeof where.dueAt === "object") {
            const range = where.dueAt as Record<string, Date>;
            result = result.filter((t) => {
              const d = new Date(t.dueAt as string).getTime();
              return (!range.gte || d >= new Date(range.gte).getTime())
                && (!range.lte || d <= new Date(range.lte).getTime());
            });
          }
          return result.map((t) => ({ ...t, customer: { id: "customer-1", displayName: "Cliente Test" } }));
        },
        updateMany: async ({ where, data }: { where: { id?: string; status?: string; dueAt?: Record<string, Date> }; data: Record<string, unknown> }) => {
          let updated = 0;
          for (let i = 0; i < tasks.length; i++) {
            const matchId = !where.id || tasks[i].id === where.id;
            const matchStatus = !where.status || tasks[i].status === where.status;
            let matchDue = true;
            if (where.dueAt) {
              const d = new Date(tasks[i].dueAt as string).getTime();
              matchDue = (!where.dueAt.lt || d < new Date(where.dueAt.lt).getTime());
            }
            if (matchId && matchStatus && matchDue) {
              tasks[i] = { ...tasks[i], ...data };
              updated++;
            }
          }
          return { count: updated };
        },
      },
      auditLog: {
        create: async () => {
          throw new Error("auditLog.create must run inside a transaction");
        },
        findMany: async () => auditLogs,
      },
      $transaction: async <T>(callback: (tx: {
        followUpTask: {
          create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
        };
        auditLog: {
          create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
        };
      }) => Promise<T>) => {
        const pendingTasks: Array<Record<string, unknown>> = [];
        const pendingAuditLogs: Array<Record<string, unknown>> = [];

        const txTask = {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            const task = {
              id: `task-${tasks.length + pendingTasks.length + 1}`,
              ...data,
              status: data.status ?? FollowUpTaskStatus.pendiente,
              createdAt: new Date("2026-04-29T00:00:00.000Z"),
              updatedAt: new Date("2026-04-29T00:00:00.000Z"),
            };
            pendingTasks.push(task);
            return task;
          },
          findUnique: async ({ where }: { where: { id: string } }) => {
            const found = [...tasks, ...pendingTasks].find((t) => t.id === where.id);
            return found ? { ...found } : null;
          },
          updateMany: async ({ where, data }: { where: { id?: string; status?: string; dueAt?: Record<string, Date> }; data: Record<string, unknown> }) => {
            const all = [...tasks, ...pendingTasks];
            let updated = 0;
            for (let i = 0; i < all.length; i++) {
              const matchId = !where.id || all[i].id === where.id;
              const matchStatus = !where.status || all[i].status === where.status;
              let matchDue = true;
              if (where.dueAt) {
                const d = new Date(all[i].dueAt as string).getTime();
                matchDue = (!where.dueAt.lt || d < new Date(where.dueAt.lt).getTime());
              }
              if (matchId && matchStatus && matchDue) {
                if (i < tasks.length) {
                  tasks[i] = { ...tasks[i], ...data };
                } else {
                  pendingTasks[i - tasks.length] = { ...pendingTasks[i - tasks.length], ...data };
                }
                updated++;
              }
            }
            return { count: updated };
          },
        };

        const result = await callback({
          followUpTask: txTask,
          auditLog: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
              const entry = {
                id: `audit-${auditLogs.length + pendingAuditLogs.length + 1}`,
                createdAt: new Date("2026-04-29T00:00:00.000Z"),
                ...data,
              };
              pendingAuditLogs.push(entry);
              return entry;
            },
          },
        });

        tasks.push(...pendingTasks);
        auditLogs.push(...pendingAuditLogs);

        return result;
      },
    };

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaStub)
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

  it("creates a follow-up task", async () => {
    const response = await request(globalThis.__APP__)
      .post("/follow-up-tasks")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        customerId: "customer-1",
        type: FollowUpTaskType.llamada,
        title: "Llamar al cliente",
        dueAt: "2026-04-30T10:00:00.000Z",
      })
      .expect(201);

    expect(response.body.customerId).toBe("customer-1");
    expect(response.body.status).toBe(FollowUpTaskStatus.pendiente);
  });

  it("completes a pending task", async () => {
    const createResponse = await request(globalThis.__APP__)
      .post("/follow-up-tasks")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        customerId: "customer-1",
        type: FollowUpTaskType.email,
        title: "Enviar propuesta",
        dueAt: "2026-05-01T10:00:00.000Z",
      })
      .expect(201);

    const taskId = createResponse.body.id;

    await request(globalThis.__APP__)
      .patch(`/follow-up-tasks/${taskId}/complete`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(200);

    const updated = tasks.find((t) => t.id === taskId);
    expect(updated?.status).toBe(FollowUpTaskStatus.completada);
  });

  it("marks overdue tasks", async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);

    const createResponse = await request(globalThis.__APP__)
      .post("/follow-up-tasks")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        customerId: "customer-1",
        type: FollowUpTaskType.llamada,
        title: "Tarea vencida",
        dueAt: pastDate.toISOString(),
      })
      .expect(201);

    const taskId = createResponse.body.id;

    await request(globalThis.__APP__)
      .post("/follow-up-tasks/mark-overdue")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(201);

    const updated = tasks.find((t) => t.id === taskId);
    expect(updated?.status).toBe(FollowUpTaskStatus.vencida);
  });

  it("filters tasks by status", async () => {
    const response = await request(globalThis.__APP__)
      .get("/follow-up-tasks?status=pendiente")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.every((t: { status: string }) => t.status === FollowUpTaskStatus.pendiente)).toBe(true);
  });

  it("filters tasks by assignedToMe", async () => {
    const response = await request(globalThis.__APP__)
      .get("/follow-up-tasks?assignedToMe=true")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
  });
});
