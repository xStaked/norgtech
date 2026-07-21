import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { Prisma, UserRole } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { refreshTokenStub } from "./helpers/login-as";

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

  const segments = [
    {
      id: "segment-bronze",
      name: "Bronce",
      description: "Segmento base",
      discountPercent: 0,
      minGoalAmount: 0,
      maxGoalAmount: 1000000,
      active: true,
      createdBy: "admin-user-id",
      updatedBy: "admin-user-id",
      createdAt: new Date("2026-04-29T00:00:00.000Z"),
      updatedAt: new Date("2026-04-29T00:00:00.000Z"),
    },
    {
      id: "segment-silver",
      name: "Plata",
      description: "Segmento intermedio",
      discountPercent: 10,
      minGoalAmount: 1000000,
      maxGoalAmount: 5000000,
      active: true,
      createdBy: "admin-user-id",
      updatedBy: "admin-user-id",
      createdAt: new Date("2026-04-29T00:00:00.000Z"),
      updatedAt: new Date("2026-04-29T00:00:00.000Z"),
    },
  ];

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

        if (where.email === "director@norgtech.local") {
          return {
            id: "director-user-id",
            name: "Director",
            email: "director@norgtech.local",
            passwordHash,
            role: UserRole.director_comercial,
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
      findMany: async () => segments,
    };

    const orderAggregate = {
      aggregate: async () => ({
        _sum: { total: 0 },
      }),
      // Honors where.customerId instead of returning a fixed value: a stub
      // that always returned 0 (or always 1) would make the guard test pass
      // for the wrong reason regardless of which customer was patched.
      count: async ({ where }: { where: { customerId: string } }) =>
        where.customerId === "customer-with-orders" ? 1 : 0,
    };

    const companies: Record<string, { id: string; name: string; isActive: boolean }> = {
      clx_default_norgtech: { id: "clx_default_norgtech", name: "Norgtech", isActive: true },
      clx_default_nanonutricion: {
        id: "clx_default_nanonutricion",
        name: "Nanonutrición",
        isActive: true,
      },
    };

    const company = {
      findUnique: async ({ where: { id } }: { where: { id: string } }) => companies[id] ?? null,
    };

    const prismaStub = {
      user,
      refreshToken: refreshTokenStub(),
      customerSegment,
      company,
      order: orderAggregate,
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
        // Honors the `where.active` filter so the includeInactive e2e below is
        // real: the admin list passes `where: { active: true }` by default and
        // `where: undefined` when includeInactive is set.
        //
        // Also honors `select`: a field the caller didn't ask for must not
        // show up in the response. A field this stub doesn't recognize would
        // otherwise be IGNORED in silence, making tests pass for the wrong
        // reason. Better to fail loudly.
        findMany: async ({
          where,
          select,
        }: {
          where?: { active?: boolean };
          select?: Record<string, boolean>;
        } = {}) => {
          const filtered = customers.filter(
            (c) =>
              where?.active === undefined ||
              ((c as { active?: boolean }).active ?? true) === where.active,
          );

          if (!select) {
            return filtered;
          }

          const KNOWN_SELECT_KEYS = [
            "id",
            "legalName",
            "displayName",
            "taxId",
            "phone",
            "email",
            "city",
            "department",
            "creditLimit",
            "active",
            "segment",
            "company",
            "contacts",
          ];

          for (const key of Object.keys(select)) {
            if (select[key] && !KNOWN_SELECT_KEYS.includes(key)) {
              throw new Error(
                `customer.findMany stub: campo de select no soportado "${key}". Enséñale el campo al stub antes de usarlo.`,
              );
            }
          }

          return filtered.map((c) => {
            const record = c as Record<string, unknown>;
            const projected: Record<string, unknown> = {};
            for (const key of KNOWN_SELECT_KEYS) {
              if (select[key]) {
                projected[key] = record[key];
              }
            }
            return projected;
          });
        },
        update: async () => {
          throw new Error("customer.update must run inside a transaction");
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
                companyId: string;
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
            update: (args: {
              where: { id: string };
              data: { segmentId?: string; updatedBy?: string };
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
                companyId: string;
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
              const taxIdTaken = [...customers, ...pendingCustomers].some(
                (c) => data.taxId !== undefined && c.taxId === data.taxId,
              );
              if (taxIdTaken) {
                throw new Prisma.PrismaClientKnownRequestError(
                  "Unique constraint failed on the fields: (`taxId`)",
                  { code: "P2002", clientVersion: "test", meta: { target: ["taxId"] } },
                );
              }

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
                companyId: data.companyId,
                company: companies[data.companyId]
                  ? { id: companies[data.companyId].id, name: companies[data.companyId].name }
                  : null,
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
            update: async ({
              where,
              data,
            }: {
              where: { id: string };
              data: { segmentId?: string; updatedBy?: string };
            }) => {
              const idx = customers.findIndex((c) => c.id === where.id);
              if (idx !== -1) {
                customers[idx] = {
                  ...customers[idx],
                  ...data,
                  updatedAt: new Date("2026-04-29T00:00:00.000Z"),
                };
                return customers[idx];
              }
              return {};
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
        companyId: "clx_default_norgtech",
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
        companyId: "clx_default_norgtech",
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
        companyId: "clx_default_norgtech",
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
        companyId: "clx_default_norgtech",
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
        companyId: "clx_default_norgtech",
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
        companyId: "clx_default_norgtech",
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
        companyId: "clx_default_norgtech",
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
        companyId: "clx_default_norgtech",
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
        companyId: "clx_default_norgtech",
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

  // CLI-02: a duplicate taxId used to surface the raw Prisma P2002 as a 500.
  it("returns 409 with a Spanish message when the taxId already exists", async () => {
    const payload = {
      legalName: "Duplicada SAS",
      displayName: "Duplicada",
      taxId: "901555444",
      segmentId: globalThis.__SEGMENT_ID__,
      companyId: "clx_default_norgtech",
      contacts: [
        {
          fullName: "Carlos Perez",
          email: "carlos@duplicada.co",
          isPrimary: true,
        },
      ],
    };

    await request(globalThis.__APP__)
      .post("/customers")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send(payload)
      .expect(201);

    const response = await request(globalThis.__APP__)
      .post("/customers")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ ...payload, displayName: "Otra razon social" })
      .expect(409);

    expect(response.body.message).toBe("Ya existe un cliente con ese NIT (taxId)");
  });

  // ZON-01/COM-01 family: a deactivated customer must not silently disappear
  // from the admin list, but only when the caller opts in. Default stays
  // active-only so selectors and Nora keep receiving active rows.
  it("excludes inactive customers from the default list but includes them with includeInactive", async () => {
    customers.push({
      id: "inactive-customer-id",
      legalName: "Inactiva SAS",
      displayName: "Inactiva",
      taxId: "800000000",
      phone: null,
      email: null,
      city: null,
      department: null,
      notes: null,
      segmentId,
      companyId: "clx_default_norgtech",
      company: { id: "clx_default_norgtech", name: "Norgtech" },
      assignedToUserId: null,
      creditLimit: null,
      active: false,
      contacts: [],
      createdAt: new Date("2026-04-29T00:00:00.000Z"),
      updatedAt: new Date("2026-04-29T00:00:00.000Z"),
    });

    const defaultResponse = await request(globalThis.__APP__)
      .get("/customers")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(200);

    const defaultIds = (defaultResponse.body as Array<{ id: string }>).map((c) => c.id);
    expect(defaultIds).not.toContain("inactive-customer-id");

    const inclusiveResponse = await request(globalThis.__APP__)
      .get("/customers?includeInactive=true")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(200);

    const inclusiveIds = (inclusiveResponse.body as Array<{ id: string }>).map((c) => c.id);
    expect(inclusiveIds).toContain("inactive-customer-id");
  });

  it("allows director_comercial to refresh segments", async () => {
    const directorLogin = await request(globalThis.__APP__)
      .post("/auth/login")
      .send({ email: "director@norgtech.local", password: "Admin123*" })
      .expect(200);

    const directorToken = directorLogin.body.accessToken;

    const response = await request(globalThis.__APP__)
      .post("/customers/refresh-segments")
      .set("Authorization", `Bearer ${directorToken}`)
      .expect(201);

    expect(response.body.totalCustomers).toBeDefined();
    expect(response.body.updated).toBeDefined();
    expect(Array.isArray(response.body.details)).toBe(true);
  });

  it("rechaza crear un cliente sin empresa", async () => {
    const response = await request(globalThis.__APP__)
      .post("/customers")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        legalName: "Cliente Sin Empresa SAS",
        displayName: "Cliente Sin Empresa",
        segmentId: globalThis.__SEGMENT_ID__,
        contacts: [{ fullName: "Contacto", isPrimary: true }],
      });

    expect(response.status).toBe(400);
  });

  it("expone la empresa en el listado", async () => {
    const response = await request(globalThis.__APP__)
      .get("/customers")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`);

    expect(response.status).toBe(200);
    const target = (response.body as Array<{ legalName: string; company: unknown }>).find(
      (c) => c.legalName === "Agropecuaria Norte SAS",
    );
    expect(target).toBeDefined();
    expect(target?.company).toEqual({
      id: "clx_default_norgtech",
      name: "Norgtech",
    });
  });

  it("no deja cambiar la empresa de un cliente que ya tiene ordenes", async () => {
    customers.push({
      id: "customer-with-orders",
      legalName: "Cliente Con Ordenes SAS",
      displayName: "Cliente Con Ordenes",
      taxId: "800111222",
      phone: null,
      email: null,
      city: null,
      department: null,
      notes: null,
      segmentId,
      companyId: "clx_default_norgtech",
      company: { id: "clx_default_norgtech", name: "Norgtech" },
      assignedToUserId: null,
      creditLimit: null,
      active: true,
      contacts: [],
      createdAt: new Date("2026-04-29T00:00:00.000Z"),
      updatedAt: new Date("2026-04-29T00:00:00.000Z"),
    });

    const response = await request(globalThis.__APP__)
      .patch("/customers/customer-with-orders")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ companyId: "clx_default_nanonutricion" });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain("with orders");

    const customerAfter = customers.find((c) => c.id === "customer-with-orders");
    expect(customerAfter?.companyId).toBe("clx_default_norgtech");
  });

  it("permite cambiar la empresa de un cliente sin ordenes", async () => {
    customers.push({
      id: "customer-without-orders",
      legalName: "Cliente Sin Ordenes SAS",
      displayName: "Cliente Sin Ordenes",
      taxId: "800333444",
      phone: null,
      email: null,
      city: null,
      department: null,
      notes: null,
      segmentId,
      companyId: "clx_default_norgtech",
      company: { id: "clx_default_norgtech", name: "Norgtech" },
      assignedToUserId: null,
      creditLimit: null,
      active: true,
      contacts: [],
      createdAt: new Date("2026-04-29T00:00:00.000Z"),
      updatedAt: new Date("2026-04-29T00:00:00.000Z"),
    });

    const response = await request(globalThis.__APP__)
      .patch("/customers/customer-without-orders")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ companyId: "clx_default_nanonutricion" });

    expect(response.status).toBe(200);
    expect(response.body.companyId).toBe("clx_default_nanonutricion");

    const customerAfter = customers.find((c) => c.id === "customer-without-orders");
    expect(customerAfter?.companyId).toBe("clx_default_nanonutricion");
  });
});
