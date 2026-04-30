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
  // eslint-disable-next-line no-var
  var __SEGMENT_ID__: string | undefined;
}

describe("Customers", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  const passwordHash = "$2a$10$eHlBtTx4HDVGtfsH8BSxG.JwwXsYNrKcdePOt3.1/./NPQ0CHs.w2";
  const auditLogs: Array<Record<string, unknown>> = [];
  const customers: Array<Record<string, unknown>> = [];
  const segmentId = "segment-id";
  const assignedUserId = "assigned-user-id";

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

        if (where.id === assignedUserId) {
          return {
            id: assignedUserId,
            name: "Seller",
            email: "seller@norgtech.local",
            passwordHash,
            role: UserRole.comercial,
            active: true,
          };
        }

        return null;
      },
    };

    const customerSegment = {
      findUnique: async ({ where: { id } }: { where: { id: string } }) =>
        id === segmentId
          ? {
              id: segmentId,
              name: "Oro",
              description: "Clientes de alto valor",
              active: true,
              createdBy: "admin-user-id",
              updatedBy: "admin-user-id",
              createdAt: new Date("2026-04-29T00:00:00.000Z"),
              updatedAt: new Date("2026-04-29T00:00:00.000Z"),
            }
          : null,
    };

    const prismaStub = {
      user,
      customerSegment,
      customer: {
        create: async () => {
          throw new Error("customer.create must run inside a transaction");
        },
        findUnique: async ({ where, include }: { where: { id: string }; include?: Record<string, unknown> }) => {
          const found = customers.find((c) => c.id === where.id);
          if (!found) return null;
          const result = { ...found };
          if (include?.contacts) {
            result.contacts = [
              {
                id: "contact-1",
                customerId: result.id,
                fullName: "Carlos Perez",
                roleTitle: "Compras",
                phone: "3000000000",
                email: "carlos@agronorte.co",
                isPrimary: true,
                notes: null,
                createdBy: "admin-user-id",
                updatedBy: "admin-user-id",
                createdAt: new Date("2026-04-29T00:00:00.000Z"),
                updatedAt: new Date("2026-04-29T00:00:00.000Z"),
              },
            ];
          }
          if (include?.segment) {
            result.segment = {
              id: segmentId,
              name: "Oro",
              description: "Clientes de alto valor",
              active: true,
              createdBy: "admin-user-id",
              updatedBy: "admin-user-id",
              createdAt: new Date("2026-04-29T00:00:00.000Z"),
              updatedAt: new Date("2026-04-29T00:00:00.000Z"),
            };
          }
          if (include?.opportunities) {
            result.opportunities = [];
          }
          if (include?.visits) {
            result.visits = [];
          }
          if (include?.followUpTasks) {
            result.followUpTasks = [];
          }
          if (include?.quotes) {
            result.quotes = [];
          }
          if (include?.orders) {
            result.orders = [];
          }
          if (include?.billingRequests) {
            result.billingRequests = [];
          }
          return result;
        },
      },
      auditLog: {
        create: async () => {
          throw new Error("auditLog.create must run inside a transaction");
        },
        findMany: async ({
          where,
        }: {
          where?: { entityType?: string; entityId?: string };
        }) =>
          auditLogs.filter(
            (entry) =>
              (!where?.entityType || entry.entityType === where.entityType) &&
              (!where?.entityId || entry.entityId === where.entityId),
          ),
      },
      $transaction: async <T>(
        callback: (tx: {
          customer: {
            create: (args: {
              data: {
                legalName: string;
                displayName: string;
                taxId?: string;
                phone?: string;
                email?: string;
                address?: string;
                city?: string;
                department?: string;
                notes?: string;
                segmentId: string;
                assignedToUserId?: string;
                createdBy: string;
                updatedBy: string;
                contacts: {
                  create: Array<{
                    fullName: string;
                    roleTitle?: string;
                    phone?: string;
                    email?: string;
                    isPrimary?: boolean;
                    notes?: string;
                    createdBy: string;
                    updatedBy: string;
                  }>;
                };
              };
              include?: { contacts?: boolean };
            }) => Promise<Record<string, unknown>>;
          };
          auditLog: {
            create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
          };
          user: typeof user;
          customerSegment: typeof customerSegment;
        }) => Promise<T>,
      ) => {
        const pendingCustomers: Array<Record<string, unknown>> = [];
        const pendingAuditLogs: Array<Record<string, unknown>> = [];

        const result = await callback({
          customer: {
            create: async ({
              data,
              include,
            }: {
              data: {
                legalName: string;
                displayName: string;
                taxId?: string;
                phone?: string;
                email?: string;
                address?: string;
                city?: string;
                department?: string;
                notes?: string;
                segmentId: string;
                assignedToUserId?: string;
                createdBy: string;
                updatedBy: string;
                contacts: {
                  create: Array<{
                    fullName: string;
                    roleTitle?: string;
                    phone?: string;
                    email?: string;
                    isPrimary?: boolean;
                    notes?: string;
                    createdBy: string;
                    updatedBy: string;
                  }>;
                };
              };
              include?: { contacts?: boolean };
            }) => {
              const customer = {
                id: `customer-${pendingCustomers.length + customers.length + 1}`,
                legalName: data.legalName,
                displayName: data.displayName,
                taxId: data.taxId ?? null,
                phone: data.phone ?? null,
                email: data.email ?? null,
                address: data.address ?? null,
                city: data.city ?? null,
                department: data.department ?? null,
                notes: data.notes ?? null,
                segmentId: data.segmentId,
                assignedToUserId: data.assignedToUserId ?? null,
                createdBy: data.createdBy,
                updatedBy: data.updatedBy,
                active: true,
                createdAt: new Date("2026-04-29T00:00:00.000Z"),
                updatedAt: new Date("2026-04-29T00:00:00.000Z"),
                contacts: include?.contacts
                  ? data.contacts.create.map((contact, index) => ({
                      id: `contact-${pendingCustomers.length + customers.length + 1}-${index + 1}`,
                      customerId: `customer-${pendingCustomers.length + customers.length + 1}`,
                      fullName: contact.fullName,
                      roleTitle: contact.roleTitle ?? null,
                      phone: contact.phone ?? null,
                      email: contact.email ?? null,
                      isPrimary: contact.isPrimary ?? false,
                      notes: contact.notes ?? null,
                      createdBy: contact.createdBy,
                      updatedBy: contact.updatedBy,
                      createdAt: new Date("2026-04-29T00:00:00.000Z"),
                      updatedAt: new Date("2026-04-29T00:00:00.000Z"),
                    }))
                  : undefined,
              };

              pendingCustomers.push(customer);
              return customer;
            },
          },
          auditLog: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
              const entry = {
                id: `audit-${pendingAuditLogs.length + auditLogs.length + 1}`,
                createdAt: new Date("2026-04-29T00:00:00.000Z"),
                ...data,
              };

              pendingAuditLogs.push(entry);
              return entry;
            },
          },
          user,
          customerSegment,
        });

        customers.push(...pendingCustomers);
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
    globalThis.__SEGMENT_ID__ = segmentId;

    const loginResponse = await request(globalThis.__APP__)
      .post("/auth/login")
      .send({ email: "admin@norgtech.local", password: "Admin123*" })
      .expect(200);

    globalThis.__ADMIN_TOKEN__ = loginResponse.body.accessToken;
  });

  afterAll(async () => {
    globalThis.__ADMIN_TOKEN__ = undefined;
    globalThis.__APP__ = undefined;
    globalThis.__SEGMENT_ID__ = undefined;

    if (app) {
      await app.close();
    }
  });

  it("creates a customer and a primary contact and records audit", async () => {
    const createResponse = await request(globalThis.__APP__)
      .post("/customers")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        legalName: "Agropecuaria Norte SAS",
        displayName: "Agro Norte",
        taxId: "900123456",
        segmentId: globalThis.__SEGMENT_ID__,
        contacts: [
          {
            fullName: "Carlos Perez",
            roleTitle: "Compras",
            phone: "3000000000",
            email: "carlos@agronorte.co",
            isPrimary: true,
          },
        ],
      })
      .expect(201);

    expect(createResponse.body.contacts).toHaveLength(1);

    const auditResponse = await request(globalThis.__APP__)
      .get(`/audit?entityType=Customer&entityId=${createResponse.body.id}`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(200);

    expect(auditResponse.body[0].action).toBe("customer.created");
  });

  it("rejects customer creation without exactly one primary contact", async () => {
    await request(globalThis.__APP__)
      .post("/customers")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        legalName: "Agropecuaria Norte SAS",
        displayName: "Agro Norte",
        segmentId: globalThis.__SEGMENT_ID__,
        contacts: [
          {
            fullName: "Carlos Perez",
            email: "carlos@agronorte.co",
            isPrimary: false,
          },
        ],
      })
      .expect(400);

    await request(globalThis.__APP__)
      .post("/customers")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        legalName: "Agropecuaria Norte SAS",
        displayName: "Agro Norte",
        segmentId: globalThis.__SEGMENT_ID__,
        contacts: [
          {
            fullName: "Carlos Perez",
            email: "carlos@agronorte.co",
            isPrimary: true,
          },
          {
            fullName: "Ana Gomez",
            email: "ana@agronorte.co",
            isPrimary: true,
          },
        ],
      })
      .expect(400);
  });

  it("rejects nonexistent segment and assigned user ids", async () => {
    await request(globalThis.__APP__)
      .post("/customers")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        legalName: "Agropecuaria Norte SAS",
        displayName: "Agro Norte",
        segmentId: "missing-segment-id",
        contacts: [
          {
            fullName: "Carlos Perez",
            email: "carlos@agronorte.co",
            isPrimary: true,
          },
        ],
      })
      .expect(404);

    await request(globalThis.__APP__)
      .post("/customers")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        legalName: "Agropecuaria Norte SAS",
        displayName: "Agro Norte",
        segmentId: globalThis.__SEGMENT_ID__,
        assignedToUserId: "missing-user-id",
        contacts: [
          {
            fullName: "Carlos Perez",
            email: "carlos@agronorte.co",
            isPrimary: true,
          },
        ],
      })
      .expect(404);
  });

  it("rejects empty assigned user ids before persistence", async () => {
    await request(globalThis.__APP__)
      .post("/customers")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        legalName: "Agropecuaria Norte SAS",
        displayName: "Agro Norte",
        segmentId: globalThis.__SEGMENT_ID__,
        assignedToUserId: "",
        contacts: [
          {
            fullName: "Carlos Perez",
            email: "carlos@agronorte.co",
            isPrimary: true,
          },
        ],
      })
      .expect(400);
  });

  it("rejects empty required names and invalid customer email", async () => {
    await request(globalThis.__APP__)
      .post("/customers")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        legalName: "",
        displayName: "Agro Norte",
        segmentId: globalThis.__SEGMENT_ID__,
        contacts: [
          {
            fullName: "Carlos Perez",
            email: "carlos@agronorte.co",
            isPrimary: true,
          },
        ],
      })
      .expect(400);

    await request(globalThis.__APP__)
      .post("/customers")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        legalName: "Agropecuaria Norte SAS",
        displayName: "Agro Norte",
        email: "not-an-email",
        segmentId: globalThis.__SEGMENT_ID__,
        contacts: [
          {
            fullName: "",
            email: "carlos@agronorte.co",
            isPrimary: true,
          },
        ],
      })
      .expect(400);
  });

  it("returns a customer with all related collections", async () => {
    const createResponse = await request(globalThis.__APP__)
      .post("/customers")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        legalName: "Cliente 360 SAS",
        displayName: "Cliente 360",
        taxId: "900999999",
        segmentId: globalThis.__SEGMENT_ID__,
        contacts: [
          {
            fullName: "Ana Lopez",
            roleTitle: "Gerente",
            phone: "3100000000",
            email: "ana@cliente360.co",
            isPrimary: true,
          },
        ],
      })
      .expect(201);

    const customerId = createResponse.body.id;

    const getResponse = await request(globalThis.__APP__)
      .get(`/customers/${customerId}`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(200);

    expect(getResponse.body.id).toBe(customerId);
    expect(getResponse.body.contacts).toBeDefined();
    expect(getResponse.body.contacts).toHaveLength(1);
    expect(getResponse.body.segment).toBeDefined();
    expect(getResponse.body.opportunities).toBeDefined();
    expect(getResponse.body.visits).toBeDefined();
    expect(getResponse.body.followUpTasks).toBeDefined();
    expect(getResponse.body.quotes).toBeDefined();
    expect(getResponse.body.orders).toBeDefined();
    expect(getResponse.body.billingRequests).toBeDefined();
  });
});
