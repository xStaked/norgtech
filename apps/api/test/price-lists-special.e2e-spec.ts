import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { UserRole } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { findMockUserByEmail, loginAs, refreshTokenStub } from "./helpers/login-as";

describe("Special price lists", () => {
  let app: INestApplication;

  const commercialId = "00000000-0000-4000-8000-000000000003";
  const customers = new Map([
    ["customer-cop", { id: "customer-cop", displayName: "Cliente COP", currency: "COP", assignedToUserId: commercialId }],
    ["customer-usd", { id: "customer-usd", displayName: "Cliente USD", currency: "USD", assignedToUserId: commercialId }],
  ]);
  const auditRecords: Array<Record<string, unknown>> = [];

  beforeAll(async () => {
    const prismaStub: Record<string, any> = {
      user: {
        findUnique: async ({ where }: { where: { email?: string } }) =>
          findMockUserByEmail(where.email),
      },
      refreshToken: refreshTokenStub(),
      customer: {
        findMany: async ({ where }: { where: { id: { in: string[] }; active: boolean } }) =>
          where.id.in
            .map((id) => customers.get(id))
            .filter((customer): customer is NonNullable<typeof customer> => !!customer),
      },
      productPresentation: {
        findMany: async ({ where }: { where: { id: { in: string[] }; active: boolean } }) =>
          where.id.in
            .filter((id) => id === "presentation-500g")
            .map((id) => ({ id })),
      },
      specialPriceList: {
        create: async ({ data }: { data: Record<string, any> }) => {
          const revision = data.revisions.create as Record<string, any>;
          const items = (revision.items.create as Array<Record<string, any>>).map((item, index) => {
            const customer = customers.get(item.customer.connect.id)!;
            return {
              id: `special-item-${index + 1}`,
              ownerUserId: data.owner.connect.id,
              customerId: customer.id,
              presentationId: item.presentation.connect.id,
              priceSinIva: item.priceSinIva,
              priceConIva: item.priceConIva,
              taxPercent: item.taxPercent,
              customer,
              presentation: { id: "presentation-500g", empaque: "Bolsa x 500 g" },
            };
          });
          const memberships = (revision.customers.create as Array<Record<string, any>>).map(
            (membership) => ({ customer: customers.get(membership.customer.connect.id) }),
          );
          return {
            id: "special-list-1",
            name: data.name,
            ownerUserId: data.owner.connect.id,
            revisions: [
              {
                id: "special-revision-1",
                revision: revision.revision,
                status: revision.status,
                active: revision.active,
                customers: memberships,
                items,
              },
            ],
          };
        },
      },
      auditLog: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          auditRecords.push(data);
          return { id: `audit-${auditRecords.length}`, ...data };
        },
      },
    };
    prismaStub.$transaction = async (callback: (tx: Record<string, any>) => Promise<unknown>) =>
      callback({
        specialPriceList: prismaStub.specialPriceList,
        auditLog: prismaStub.auditLog,
      });

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaStub)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it("creates special-list entries per customer and presentation", async () => {
    const token = await loginAs(app, UserRole.comercial);

    const response = await request(app.getHttpServer())
      .post("/special-price-lists")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Grupo VIOS especial",
        items: [
          {
            customerId: "customer-cop",
            presentationId: "presentation-500g",
            priceSinIva: 12500,
            priceConIva: 13125,
            taxPercent: 5,
          },
          {
            customerId: "customer-usd",
            presentationId: "presentation-500g",
            priceSinIva: 25.5,
            priceConIva: 26.78,
            taxPercent: 5,
          },
        ],
      })
      .expect(201);

    expect(response.body.ownerUserId).toBe("00000000-0000-4000-8000-000000000003");
    expect(response.body.revisions[0].status).toBe("en_revision");
    expect(response.body.revisions[0].items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          customerId: "customer-cop",
          presentationId: "presentation-500g",
          priceSinIva: expect.anything(),
          customer: expect.objectContaining({ currency: "COP" }),
        }),
        expect.objectContaining({
          customerId: "customer-usd",
          presentationId: "presentation-500g",
          priceSinIva: expect.anything(),
          customer: expect.objectContaining({ currency: "USD" }),
        }),
      ]),
    );

    const [copItem, usdItem] = response.body.revisions[0].items;
    expect(Number(copItem.priceSinIva)).toBe(12500);
    expect(Number(usdItem.priceSinIva)).toBe(25.5);
    expect(auditRecords).toHaveLength(1);
    expect(auditRecords[0]).toMatchObject({
      entityType: "SpecialPriceList",
      entityId: "special-list-1",
      action: "special_price_list.submitted",
      actorUserId: commercialId,
    });
  });
});
