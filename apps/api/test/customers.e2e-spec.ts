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

        if (where.email === "seller@norgtech.local") {
          return {
            id: assignedUserId,
            name: "Seller",
            email: "seller@norgtech.local",
            passwordHash,
            role: UserRole.comercial,
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

    // Honors where.customerId the same way orderAggregate does above: a stub
    // that ignored its argument would make the invoices-only guard test pass
    // for the wrong reason (a vacuous pass).
    const invoiceCount = {
      count: async ({ where }: { where: { customerId: string } }) =>
        where.customerId === "customer-with-invoices" ? 1 : 0,
    };

    const companies: Record<string, { id: string; name: string; isActive: boolean }> = {
      clx_default_norgtech: { id: "clx_default_norgtech", name: "Norgtech", isActive: true },
      clx_default_nanonutricion: {
        id: "clx_default_nanonutricion",
        name: "Nanonutrición",
        isActive: true,
      },
      clx_inactive_company: { id: "clx_inactive_company", name: "Inactive Company", isActive: false },
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
      invoice: invoiceCount,
      customer: {
        create: async () => {
          throw new Error("customer.create must run inside a transaction");
        },
        findUnique: async ({
          where,
          include,
        }: {
          where: { id?: string; taxId?: string };
          include?: Record<string, unknown>;
        }) => {
          const found = customers.find((c) =>
            where.taxId !== undefined ? c.taxId === where.taxId : c.id === where.id,
          );
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
          where?: Record<string, unknown>;
          select?: Record<string, boolean>;
        } = {}) => {
          // Allowlist de where: una clave que el stub no simule haría pasar
          // tests por la razon equivocada. Mejor reventar.
          const KNOWN_WHERE_KEYS = [
            "active",
            "companyId",
            "segmentId",
            "paymentCondition",
            "OR",
          ];
          for (const key of Object.keys(where ?? {})) {
            if (!KNOWN_WHERE_KEYS.includes(key)) {
              throw new Error(
                `customer.findMany stub: clave de where no soportada "${key}". Enséñale la clave al stub antes de usarla.`,
              );
            }
          }

          const w = (where ?? {}) as {
            active?: boolean;
            companyId?: string;
            segmentId?: string;
            paymentCondition?: string;
            OR?: Array<Record<string, { contains: string; mode?: string }>>;
          };

          const filtered = customers.filter((raw) => {
            const c = raw as Record<string, unknown>;
            if (
              w.active !== undefined &&
              ((c.active as boolean | undefined) ?? true) !== w.active
            ) {
              return false;
            }
            if (w.companyId && c.companyId !== w.companyId) return false;
            if (w.segmentId && c.segmentId !== w.segmentId) return false;
            if (w.paymentCondition && c.paymentCondition !== w.paymentCondition) {
              return false;
            }
            if (w.OR) {
              const hit = w.OR.some((clause) =>
                Object.entries(clause).some(([field, cond]) => {
                  // Solo baja a minusculas cuando el service pide mode:
                  // "insensitive", igual que Postgres. Si el service dejara
                  // de mandar mode, esta comparacion pasa a ser sensible a
                  // mayusculas y el test de busqueda case-insensitive falla
                  // de verdad en vez de seguir pasando por casualidad.
                  const value = String(c[field] ?? "");
                  const needle = cond.contains;
                  if (cond.mode === "insensitive") {
                    return value.toLowerCase().includes(needle.toLowerCase());
                  }
                  return value.includes(needle);
                }),
              );
              if (!hit) return false;
            }
            return true;
          });

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
            "paymentCondition",
            "paymentDays",
            "active",
            "priceListId",
            "assignedToUser",
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

  // El alta no pide segmento: el negocio solo maneja listas de precios.
  it("creates a customer without segmentId falling back to Bronce", async () => {
    const createResponse = await request(globalThis.__APP__)
      .post("/customers")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        legalName: "Sin Segmento SAS",
        displayName: "Sin Segmento",
        companyId: "clx_default_norgtech",
        contacts: [{ fullName: "Carlos Perez", isPrimary: true }],
      })
      .expect(201);

    expect(createResponse.body.segmentId).toBe("segment-bronze");
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

    // El mensaje tiene que nombrar al cliente que choca: si no, quien busco y
    // no lo encontro (porque estaba inactivo, o porque escribio el NIT con
    // puntos) recibe un "ya existe" que le suena a contradiccion.
    expect(response.body.message).toContain("Duplicada");
    expect(response.body.message).toContain("901555444");
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

  // Reactivar desde Nora: el importado huerfano queda a nombre de quien lo
  // reactiva, pero el de otro vendedor NO se puede tocar (CLI-reactivacion).
  describe("reactivacion por un comercial", () => {
    let sellerToken: string;

    const pushInactive = (id: string, assignedToUserId: string | null) => {
      customers.push({
        id,
        legalName: `${id} SAS`,
        displayName: id,
        taxId: null,
        phone: null,
        email: null,
        city: null,
        department: null,
        notes: null,
        segmentId,
        companyId: "clx_default_norgtech",
        company: { id: "clx_default_norgtech", name: "Norgtech" },
        assignedToUserId,
        creditLimit: null,
        active: false,
        contacts: [],
        createdAt: new Date("2026-04-29T00:00:00.000Z"),
        updatedAt: new Date("2026-04-29T00:00:00.000Z"),
      });
    };

    beforeAll(async () => {
      const login = await request(globalThis.__APP__)
        .post("/auth/login")
        .send({ email: "seller@norgtech.local", password: "Admin123*" })
        .expect(200);
      sellerToken = login.body.accessToken;
    });

    it("reactiva un cliente sin vendedor y se lo asigna a quien lo reactiva", async () => {
      pushInactive("huerfano", null);

      await request(globalThis.__APP__)
        .patch("/customers/huerfano")
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({ active: true })
        .expect(200);

      const stored = customers.find((c) => c.id === "huerfano");
      expect(stored?.active).toBe(true);
      expect(stored?.assignedToUserId).toBe(assignedUserId);
    });

    it("reactiva el cliente de otro vendedor sin robarselo", async () => {
      pushInactive("ajeno", "otro-vendedor-id");

      await request(globalThis.__APP__)
        .patch("/customers/ajeno")
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({ active: true })
        .expect(200);

      const stored = customers.find((c) => c.id === "ajeno");
      expect(stored?.active).toBe(true);
      expect(stored?.assignedToUserId).toBe("otro-vendedor-id");
    });

    it("prohibe que un comercial se reasigne el cliente de otro", async () => {
      pushInactive("cartera-ajena", "otro-vendedor-id");

      await request(globalThis.__APP__)
        .patch("/customers/cartera-ajena")
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({ assignedToUserId: assignedUserId })
        .expect(403);

      expect(customers.find((c) => c.id === "cartera-ajena")?.assignedToUserId).toBe(
        "otro-vendedor-id",
      );
    });
  });

  // El NIT se guarda como lo trajo el Excel ("900923429-1") pero el vendedor lo
  // dicta con puntos. Sin normalizar la busqueda no lo encontraba y al crearlo
  // el API respondia "ya existe con ese NIT": una contradiccion para el usuario.
  it("finds a customer by NIT written with dots or without the check digit", async () => {
    customers.push({
      id: "superagro-id",
      legalName: "SOCIEDAD AVICOLA SUPERAGRO SAS",
      displayName: "SOCIEDAD AVICOLA SUPERAGRO SAS",
      taxId: "900923429-1",
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

    for (const search of ["9.009.234.291", "9009234291", "900.923.429-1", "900923429"]) {
      const response = await request(globalThis.__APP__)
        .get(`/customers?search=${encodeURIComponent(search)}`)
        .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
        .expect(200);

      const ids = (response.body as Array<{ id: string }>).map((c) => c.id);
      expect(ids).toContain("superagro-id");
    }
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

  it("expone la condicion de pago en el listado", async () => {
    customers.push({
      id: "customer-credito-30",
      legalName: "Distribuidora Credito SAS",
      displayName: "Distribuidora Credito",
      taxId: "800555666",
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
      paymentCondition: "credito_30",
      paymentDays: 30,
      active: true,
      contacts: [],
      createdAt: new Date("2026-04-29T00:00:00.000Z"),
      updatedAt: new Date("2026-04-29T00:00:00.000Z"),
    });

    const response = await request(globalThis.__APP__)
      .get("/customers")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`);

    expect(response.status).toBe(200);
    const target = (
      response.body as Array<{
        legalName: string;
        paymentCondition: unknown;
        paymentDays: unknown;
      }>
    ).find((c) => c.legalName === "Distribuidora Credito SAS");
    expect(target).toBeDefined();
    expect(target?.paymentCondition).toBe("credito_30");
    expect(target?.paymentDays).toBe(30);
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

  it("no deja cambiar la empresa de un cliente que ya tiene facturas sueltas (sin ordenes)", async () => {
    customers.push({
      id: "customer-with-invoices",
      legalName: "Cliente Con Facturas SAS",
      displayName: "Cliente Con Facturas",
      taxId: "800222333",
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
      .patch("/customers/customer-with-invoices")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ companyId: "clx_default_nanonutricion" });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain("with orders");

    const customerAfter = customers.find((c) => c.id === "customer-with-invoices");
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

  it("deja quitarle el vendedor a un cliente (assignedToUserId null)", async () => {
    customers.push({
      id: "customer-vendedor-fuera",
      legalName: "Cliente Vendedor Fuera SAS",
      displayName: "Cliente Vendedor Fuera",
      taxId: "800777888",
      phone: null,
      email: null,
      city: null,
      department: null,
      notes: null,
      segmentId,
      companyId: "clx_default_norgtech",
      company: { id: "clx_default_norgtech", name: "Norgtech" },
      assignedToUserId: "user-comercial-id",
      creditLimit: null,
      active: true,
      contacts: [],
      createdAt: new Date("2026-04-29T00:00:00.000Z"),
      updatedAt: new Date("2026-04-29T00:00:00.000Z"),
    });

    // Cuando un vendedor sale de la empresa su cartera queda sin dueño hasta
    // que alguien la reasigne. Antes el DTO no aceptaba null y "Sin asignar"
    // en el formulario no hacía nada.
    const response = await request(globalThis.__APP__)
      .patch("/customers/customer-vendedor-fuera")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ assignedToUserId: null });

    expect(response.status).toBe(200);

    const customerAfter = customers.find((c) => c.id === "customer-vendedor-fuera");
    expect(customerAfter?.assignedToUserId).toBeNull();
  });

  it("rechaza cambiar a una empresa inexistente (404)", async () => {
    customers.push({
      id: "customer-no-orders-test-404",
      legalName: "Cliente Test 404 SAS",
      displayName: "Cliente Test 404",
      taxId: "800555666",
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
      .patch("/customers/customer-no-orders-test-404")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ companyId: "nonexistent-company-id" });

    expect(response.status).toBe(404);
    expect(response.body.message).toContain("Company");

    const customerAfter = customers.find((c) => c.id === "customer-no-orders-test-404");
    expect(customerAfter?.companyId).toBe("clx_default_norgtech");
  });

  it("rechaza cambiar a una empresa inactiva (404)", async () => {
    customers.push({
      id: "customer-no-orders-inactive-test",
      legalName: "Cliente Test Inactive SAS",
      displayName: "Cliente Test Inactive",
      taxId: "800777888",
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
      .patch("/customers/customer-no-orders-inactive-test")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ companyId: "clx_inactive_company" });

    expect(response.status).toBe(404);
    expect(response.body.message).toContain("Company");

    const customerAfter = customers.find((c) => c.id === "customer-no-orders-inactive-test");
    expect(customerAfter?.companyId).toBe("clx_default_norgtech");
  });

  describe("GET /customers con filtros", () => {
    const filterFixtures = [
      {
        id: "filtro-alfa-id",
        legalName: "FILTRO-ALFA SAS",
        displayName: "FILTRO-ALFA",
        taxId: "900111222-3",
        phone: null,
        email: null,
        city: "Bogota",
        department: "Cundinamarca",
        creditLimit: null,
        paymentCondition: "contado",
        paymentDays: 0,
        active: true,
        companyId: "company-filtros-a",
        company: { id: "company-filtros-a", name: "Norgtech" },
        segmentId: "segment-bronze",
        segment: { id: "segment-bronze", name: "Bronce" },
        contacts: [],
      },
      {
        id: "filtro-beta-id",
        legalName: "FILTRO-BETA LTDA",
        displayName: "FILTRO-BETA",
        taxId: "800333444-5",
        phone: null,
        email: null,
        city: "Cali",
        department: "Valle",
        creditLimit: null,
        paymentCondition: "credito_30",
        paymentDays: 30,
        active: true,
        companyId: "company-filtros-b",
        company: { id: "company-filtros-b", name: "Nanonutricion" },
        segmentId: "segment-silver",
        segment: { id: "segment-silver", name: "Plata" },
        contacts: [],
      },
      {
        id: "filtro-gamma-id",
        legalName: "FILTRO-GAMMA SA",
        displayName: "FILTRO-GAMMA",
        taxId: "700555666-7",
        phone: null,
        email: null,
        city: "Medellin",
        department: "Antioquia",
        creditLimit: null,
        paymentCondition: "contado",
        paymentDays: 0,
        active: false,
        companyId: "company-filtros-a",
        company: { id: "company-filtros-a", name: "Norgtech" },
        segmentId: "segment-bronze",
        segment: { id: "segment-bronze", name: "Bronce" },
        contacts: [],
      },
    ];

    beforeAll(() => {
      customers.push(...filterFixtures);
    });

    afterAll(() => {
      for (const fixture of filterFixtures) {
        const index = customers.findIndex((c) => c.id === fixture.id);
        if (index >= 0) customers.splice(index, 1);
      }
    });

    const namesOf = (body: Array<{ legalName: string }>) =>
      body
        .map((c) => c.legalName)
        .filter((name) => name.startsWith("FILTRO-"))
        .sort();

    it("search encuentra por nombre sin importar mayusculas", async () => {
      const response = await request(app.getHttpServer())
        .get("/customers?search=filtro-alfa&includeInactive=true")
        .set("Authorization", `Bearer ${global.__ADMIN_TOKEN__}`)
        .expect(200);

      expect(namesOf(response.body)).toEqual(["FILTRO-ALFA SAS"]);
    });

    it("search encuentra por NIT", async () => {
      const response = await request(app.getHttpServer())
        .get("/customers?search=800333444&includeInactive=true")
        .set("Authorization", `Bearer ${global.__ADMIN_TOKEN__}`)
        .expect(200);

      expect(namesOf(response.body)).toEqual(["FILTRO-BETA LTDA"]);
    });

    it("companyId filtra por empresa", async () => {
      const response = await request(app.getHttpServer())
        .get("/customers?companyId=company-filtros-b&includeInactive=true")
        .set("Authorization", `Bearer ${global.__ADMIN_TOKEN__}`)
        .expect(200);

      expect(namesOf(response.body)).toEqual(["FILTRO-BETA LTDA"]);
    });

    it("segmentId filtra por segmento", async () => {
      const response = await request(app.getHttpServer())
        .get("/customers?segmentId=segment-silver&includeInactive=true")
        .set("Authorization", `Bearer ${global.__ADMIN_TOKEN__}`)
        .expect(200);

      expect(namesOf(response.body)).toEqual(["FILTRO-BETA LTDA"]);
    });

    it("paymentCondition filtra por condicion de pago", async () => {
      const response = await request(app.getHttpServer())
        .get("/customers?paymentCondition=credito_30&includeInactive=true")
        .set("Authorization", `Bearer ${global.__ADMIN_TOKEN__}`)
        .expect(200);

      expect(namesOf(response.body)).toEqual(["FILTRO-BETA LTDA"]);
    });

    it("paymentCondition invalida responde 400", async () => {
      await request(app.getHttpServer())
        .get("/customers?paymentCondition=credito_45")
        .set("Authorization", `Bearer ${global.__ADMIN_TOKEN__}`)
        .expect(400);
    });

    it("active=false trae solo inactivos y manda sobre includeInactive", async () => {
      const response = await request(app.getHttpServer())
        .get("/customers?active=false&includeInactive=true")
        .set("Authorization", `Bearer ${global.__ADMIN_TOKEN__}`)
        .expect(200);

      expect(namesOf(response.body)).toEqual(["FILTRO-GAMMA SA"]);
    });

    // Un valor de active que no es "true"/"false" no debe colapsar
    // silenciosamente a "solo inactivos": debe rechazarse igual que
    // paymentCondition=credito_45 lo hace arriba.
    it("active con valor invalido responde 400", async () => {
      await request(app.getHttpServer())
        .get("/customers?active=basura")
        .set("Authorization", `Bearer ${global.__ADMIN_TOKEN__}`)
        .expect(400);
    });

    it("active=true trae solo activos", async () => {
      const response = await request(app.getHttpServer())
        .get("/customers?active=true")
        .set("Authorization", `Bearer ${global.__ADMIN_TOKEN__}`)
        .expect(200);

      const names = namesOf(response.body);
      expect(names).toContain("FILTRO-ALFA SAS");
      expect(names).not.toContain("FILTRO-GAMMA SA");
    });

    it("los filtros se combinan con AND", async () => {
      const response = await request(app.getHttpServer())
        .get("/customers?companyId=company-filtros-a&search=FILTRO&includeInactive=true")
        .set("Authorization", `Bearer ${global.__ADMIN_TOKEN__}`)
        .expect(200);

      expect(namesOf(response.body)).toEqual([
        "FILTRO-ALFA SAS",
        "FILTRO-GAMMA SA",
      ]);
    });

    it("sin params nuevos el default sigue siendo solo activos", async () => {
      const response = await request(app.getHttpServer())
        .get("/customers")
        .set("Authorization", `Bearer ${global.__ADMIN_TOKEN__}`)
        .expect(200);

      const names = namesOf(response.body);
      expect(names).toContain("FILTRO-ALFA SAS");
      expect(names).not.toContain("FILTRO-GAMMA SA");
    });
  });
});
