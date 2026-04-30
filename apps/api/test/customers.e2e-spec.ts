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
  const segmentId = "segment-id";

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
              : null,
        },
        customer: {
          create: async ({
            data,
            include,
          }: {
            data: {
              legalName: string;
              displayName: string;
              taxId?: string;
              segmentId: string;
              createdBy: string;
              updatedBy: string;
              contacts: {
                create: Array<{
                  fullName: string;
                  roleTitle?: string;
                  phone?: string;
                  email?: string;
                  isPrimary?: boolean;
                  createdBy: string;
                  updatedBy: string;
                }>;
              };
            };
            include?: { contacts?: boolean };
          }) => ({
            id: "customer-id",
            legalName: data.legalName,
            displayName: data.displayName,
            taxId: data.taxId ?? null,
            segmentId: data.segmentId,
            createdBy: data.createdBy,
            updatedBy: data.updatedBy,
            active: true,
            createdAt: new Date("2026-04-29T00:00:00.000Z"),
            updatedAt: new Date("2026-04-29T00:00:00.000Z"),
            contacts: include?.contacts
              ? data.contacts.create.map((contact, index) => ({
                  id: `contact-${index + 1}`,
                  customerId: "customer-id",
                  fullName: contact.fullName,
                  roleTitle: contact.roleTitle ?? null,
                  phone: contact.phone ?? null,
                  email: contact.email ?? null,
                  isPrimary: contact.isPrimary ?? false,
                  createdBy: contact.createdBy,
                  updatedBy: contact.updatedBy,
                  createdAt: new Date("2026-04-29T00:00:00.000Z"),
                  updatedAt: new Date("2026-04-29T00:00:00.000Z"),
                }))
              : undefined,
          }),
        },
        auditLog: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            const entry = {
              id: `audit-${auditLogs.length + 1}`,
              createdAt: new Date("2026-04-29T00:00:00.000Z"),
              ...data,
            };

            auditLogs.push(entry);
            return entry;
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
      })
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
});
