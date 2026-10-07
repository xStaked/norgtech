import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { UserRole } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { findMockUserByEmail, loginAs, MOCK_USERS, refreshTokenStub } from "./helpers/login-as";

describe("Special price lists", () => {
  let app: INestApplication;

  const commercialId = "00000000-0000-4000-8000-000000000003";
  const customers = new Map([
    ["customer-cop", { id: "customer-cop", displayName: "Cliente COP", currency: "COP", assignedToUserId: commercialId }],
    ["customer-usd", { id: "customer-usd", displayName: "Cliente USD", currency: "USD", assignedToUserId: commercialId }],
  ]);
  const auditRecords: Array<Record<string, unknown>> = [];
  const specialLists = new Map<string, Record<string, any>>();
  const revisions = new Map<string, Record<string, any>>();
  const memberships = new Map<string, Array<Record<string, any>>>();
  const specialItems = new Map<string, Array<Record<string, any>>>();
  let nextListId = 1;
  let nextRevisionId = 1;
  let nextItemId = 1;

  beforeAll(async () => {
    const listWithRevisions = (list: Record<string, any>) => ({
      ...list,
      revisions: (list.revisionIds as string[]).map((revisionId) => {
        const revision = revisions.get(revisionId)!;
        return {
          ...revision,
          customers: memberships.get(revisionId) ?? [],
          items: specialItems.get(revisionId) ?? [],
        };
      }),
    });
    const prismaStub: Record<string, any> = {
      user: {
        findUnique: async ({ where }: { where: { email?: string; id?: string } }) => {
          if (where.email) return findMockUserByEmail(where.email);
          return Object.values(MOCK_USERS).find((user) => user.id === where.id) ?? null;
        },
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
          const listId = `special-list-${nextListId++}`;
          const revisionId = `special-revision-${nextRevisionId++}`;
          const items = (revision.items.create as Array<Record<string, any>>).map((item) => {
            const customer = customers.get(item.customer.connect.id)!;
            return {
              id: `special-item-${nextItemId++}`,
              revisionId,
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
          const membershipRows = (revision.customers.create as Array<Record<string, any>>).map(
            (membership) => ({ revisionId, customer: customers.get(membership.customer.connect.id) }),
          );
          const parent = {
            id: listId,
            name: data.name,
            ownerUserId: data.owner.connect.id,
            revisionIds: [revisionId],
          };
          specialLists.set(listId, parent);
          revisions.set(revisionId, {
            id: revisionId,
            specialPriceListId: listId,
            revision: revision.revision,
            status: revision.status,
            active: revision.active,
            createdByUserId: data.owner.connect.id,
            reviewedByUserId: null,
          });
          specialItems.set(revisionId, items);
          const customersForRevision = membershipRows.map((row) => ({ ...row, revisionId }));
          memberships.set(revisionId, customersForRevision);
          return listWithRevisions(parent);
        },
        findMany: async ({ where = {} }: { where?: Record<string, any> }) =>
          [...specialLists.values()]
            .filter((list) => !where.ownerUserId || list.ownerUserId === where.ownerUserId)
            .map(listWithRevisions),
        findUnique: async ({ where: { id } }: { where: { id: string } }) => {
          const list = specialLists.get(id);
          return list ? listWithRevisions(list) : null;
        },
        update: async ({ where: { id }, data }: { where: { id: string }; data: Record<string, any> }) => {
          const list = specialLists.get(id);
          if (!list) throw new Error("Record to update not found");
          const updated = { ...list, ...data };
          specialLists.set(id, updated);
          return listWithRevisions(updated);
        },
      },
      specialPriceListRevision: {
        findUnique: async ({ where: { id } }: { where: { id: string } }) => {
          const revision = revisions.get(id);
          if (!revision) return null;
          return {
            ...revision,
            specialPriceList: specialLists.get(revision.specialPriceListId),
            customers: memberships.get(id) ?? [],
            items: specialItems.get(id) ?? [],
          };
        },
        create: async ({ data }: { data: Record<string, any> }) => {
          const id = `special-revision-${nextRevisionId++}`;
          const revision = { id, active: false, ...data };
          revisions.set(id, revision);
          const parent = specialLists.get(data.specialPriceListId);
          if (parent) parent.revisionIds.push(id);
          memberships.set(id, []);
          specialItems.set(id, []);
          return revision;
        },
        update: async ({ where: { id }, data }: { where: { id: string }; data: Record<string, any> }) => {
          const revision = revisions.get(id);
          if (!revision) throw new Error("Record to update not found");
          const updated = { ...revision, ...data };
          revisions.set(id, updated);
          return updated;
        },
        updateMany: async ({ where, data }: { where: Record<string, any>; data: Record<string, any> }) => {
          let count = 0;
          for (const [id, revision] of revisions) {
            if (
              (!where.specialPriceListId || revision.specialPriceListId === where.specialPriceListId) &&
              (where.active === undefined || revision.active === where.active)
            ) {
              revisions.set(id, { ...revision, ...data });
              count += 1;
            }
          }
          return { count };
        },
        findMany: async ({ where }: { where: Record<string, any> }) =>
          [...revisions.values()].filter(
            (revision) =>
              (!where.specialPriceListId || revision.specialPriceListId === where.specialPriceListId) &&
              (where.active === undefined || revision.active === where.active),
          ),
        findFirst: async ({ where }: { where: Record<string, any> }) => {
          const candidates: Array<Record<string, any>> = [...revisions.values()].map((revision) => ({
            ...revision,
            items: specialItems.get(revision.id) ?? [],
          }));
          return candidates.find(
            (revision) =>
              revision.specialPriceListId === where.specialPriceListId &&
              (where.active === undefined || revision.active === where.active),
          ) ?? null;
        },
      },
      specialPriceListCustomer: {
        findMany: async ({ where = {} }: { where?: Record<string, any> } = {}) =>
          [...memberships.entries()]
            .filter(([revisionId]) => !where.revisionId || revisionId === where.revisionId)
            .flatMap(([, rows]) => rows),
        createMany: async ({ data }: { data: Array<Record<string, any>> }) => {
          for (const row of data) {
            const rows = memberships.get(row.revisionId) ?? [];
            rows.push({ ...row, customer: customers.get(row.customerId) });
            memberships.set(row.revisionId, rows);
          }
          return { count: data.length };
        },
        deleteMany: async ({ where }: { where: Record<string, any> }) => {
          const rows = memberships.get(where.revisionId) ?? [];
          memberships.set(
            where.revisionId,
            rows.filter((row) => where.customerId !== undefined && row.customerId !== where.customerId),
          );
          return { count: rows.length - (memberships.get(where.revisionId)?.length ?? 0) };
        },
      },
      specialPriceListItem: {
        findMany: async ({ where = {} }: { where?: Record<string, any> } = {}) =>
          [...specialItems.entries()]
            .filter(([revisionId]) => !where.revisionId || revisionId === where.revisionId)
            .flatMap(([, rows]) => rows)
            .filter((item) =>
              Object.entries(where).every(([key, value]) =>
                typeof value === "object" && value !== null
                  ? true
                  : item[key] === value,
              ),
            ),
        createMany: async ({ data }: { data: Array<Record<string, any>> }) => {
          for (const row of data) {
            const rows = specialItems.get(row.revisionId) ?? [];
            rows.push({ id: `special-item-${nextItemId++}`, ...row });
            specialItems.set(row.revisionId, rows);
          }
          return { count: data.length };
        },
        deleteMany: async ({ where }: { where: Record<string, any> }) => {
          const rows = specialItems.get(where.revisionId) ?? [];
          specialItems.set(
            where.revisionId,
            rows.filter((row) => where.customerId !== undefined && row.customerId !== where.customerId),
          );
          return { count: rows.length - (specialItems.get(where.revisionId)?.length ?? 0) };
        },
        updateMany: async ({ where, data }: { where: Record<string, any>; data: Record<string, any> }) => {
          let count = 0;
          for (const [revisionId, rows] of specialItems) {
            const updated = rows.map((row) => {
              const matches = Object.entries(where).every(([key, value]) => row[key] === value);
              if (matches) {
                count += 1;
                return { ...row, ...data };
              }
              return row;
            });
            specialItems.set(revisionId, updated);
          }
          return { count };
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
        specialPriceListRevision: prismaStub.specialPriceListRevision,
        specialPriceListCustomer: prismaStub.specialPriceListCustomer,
        specialPriceListItem: prismaStub.specialPriceListItem,
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

  beforeEach(() => {
    auditRecords.length = 0;
    specialLists.clear();
    revisions.clear();
    memberships.clear();
    specialItems.clear();
    nextListId = 1;
    nextRevisionId = 1;
    nextItemId = 1;
  });

  async function createSpecialList(role: UserRole, name: string) {
    const token = await loginAs(app, role);
    const response = await request(app.getHttpServer())
      .post("/special-price-lists")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name,
        items: [{ customerId: "customer-cop", presentationId: "presentation-500g", priceSinIva: 12500 }],
      })
      .expect(201);
    return { token, response };
  }

  it("creates special-list entries per customer and presentation", async () => {
    auditRecords.length = 0;
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

  it("commercial can read only owned special lists", async () => {
    const { response: owned } = await createSpecialList(UserRole.comercial, "Lista propia");
    await createSpecialList(UserRole.promotor, "Lista de promotor");
    const token = await loginAs(app, UserRole.comercial);

    const response = await request(app.getHttpServer())
      .get("/special-price-lists")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.map((list: { id: string }) => list.id)).toEqual([owned.body.id]);
  });

  it("commercial cannot choose another user as special-list owner", async () => {
    const token = await loginAs(app, UserRole.comercial);

    await request(app.getHttpServer())
      .post("/special-price-lists")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Lista con propietario falso",
        ownerUserId: "00000000-0000-4000-8000-000000000001",
        items: [{ customerId: "customer-cop", presentationId: "presentation-500g", priceSinIva: 100 }],
      })
      .expect(400);
  });

  it("commercial can correct a rejected revision and resubmit it", async () => {
    const { token, response: created } = await createSpecialList(UserRole.comercial, "Lista revisable");
    const listId = created.body.id as string;
    const firstRevisionId = created.body.revisions[0].id as string;
    const adminToken = await loginAs(app, UserRole.administrador);

    await request(app.getHttpServer())
      .patch(`/special-price-lists/${listId}/revisions/${firstRevisionId}/approval`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "aprobar" })
      .expect(200);

    const newRevision = await request(app.getHttpServer())
      .post(`/special-price-lists/${listId}/revisions`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    const revisionId = newRevision.body.id as string;

    await request(app.getHttpServer())
      .patch(`/special-price-lists/${listId}/revisions/${revisionId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [{ customerId: "customer-cop", presentationId: "presentation-500g", priceSinIva: 13250 }],
      })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/special-price-lists/${listId}/revisions/${revisionId}/submit`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    let current = await request(app.getHttpServer())
      .get(`/special-price-lists/${listId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(current.body.revisions.find((revision: { id: string }) => revision.id === firstRevisionId).active).toBe(true);
    expect(current.body.revisions.find((revision: { id: string }) => revision.id === revisionId).active).toBe(false);

    await request(app.getHttpServer())
      .patch(`/special-price-lists/${listId}/revisions/${revisionId}/approval`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "rechazar" })
      .expect(200);

    const edited = await request(app.getHttpServer())
      .patch(`/special-price-lists/${listId}/revisions/${revisionId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [{ customerId: "customer-cop", presentationId: "presentation-500g", priceSinIva: 13250 }],
      })
      .expect(200);

    expect(Number(edited.body.items[0].priceSinIva)).toBe(13250);

    const resubmitted = await request(app.getHttpServer())
      .post(`/special-price-lists/${listId}/revisions/${revisionId}/submit`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    expect(resubmitted.body.status).toBe("en_revision");
    expect(resubmitted.body.active).toBe(false);

    current = await request(app.getHttpServer())
      .get(`/special-price-lists/${listId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const stillActive = current.body.revisions.find(
      (revision: { id: string }) => revision.id === firstRevisionId,
    );
    expect(stillActive.active).toBe(true);
    expect(Number(stillActive.items[0].priceSinIva)).toBe(12500);
  });

  it("only administrator director and promotor can review a special revision", async () => {
    const { response: unauthorizedList } = await createSpecialList(UserRole.comercial, "Lista sin permiso");
    const unauthorizedRevisionId = unauthorizedList.body.revisions[0].id as string;
    const commercialToken = await loginAs(app, UserRole.comercial);

    await request(app.getHttpServer())
      .patch(`/special-price-lists/${unauthorizedList.body.id}/revisions/${unauthorizedRevisionId}/approval`)
      .set("Authorization", `Bearer ${commercialToken}`)
      .send({ action: "aprobar" })
      .expect(403);

    for (const role of [UserRole.administrador, UserRole.director_comercial, UserRole.promotor]) {
      const { response: created } = await createSpecialList(UserRole.comercial, `Lista ${role}`);
      const listId = created.body.id as string;
      const revisionId = created.body.revisions[0].id as string;
      const token = await loginAs(app, role);
      const response = await request(app.getHttpServer())
        .patch(`/special-price-lists/${listId}/revisions/${revisionId}/approval`)
        .set("Authorization", `Bearer ${token}`)
        .send({ action: "aprobar" })
        .expect(200);

      expect(response.body.status).toBe("aprobada");
    }
    expect(auditRecords.filter((record) => record.action === "special_price_list.approval_updated")).toHaveLength(3);
  });

  it("manager deactivates a special list without deleting its revision or prices", async () => {
    const { response: created } = await createSpecialList(UserRole.comercial, "Lista desactivable");
    const listId = created.body.id as string;
    const revisionId = created.body.revisions[0].id as string;
    const adminToken = await loginAs(app, UserRole.administrador);

    await request(app.getHttpServer())
      .patch(`/special-price-lists/${listId}/revisions/${revisionId}/approval`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "aprobar" })
      .expect(200);

    const deactivated = await request(app.getHttpServer())
      .patch(`/special-price-lists/${listId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ active: false })
      .expect(200);

    expect(deactivated.body.active).toBe(false);
    const detail = await request(app.getHttpServer())
      .get(`/special-price-lists/${listId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(detail.body.revisions[0].status).toBe("aprobada");
    expect(detail.body.revisions[0].items).toHaveLength(1);
    expect(detail.body.revisions[0].items[0].active).toBe(false);

    const { response: replacement } = await createSpecialList(UserRole.comercial, "Lista reemplazo");
    const replacementRevisionId = replacement.body.revisions[0].id as string;
    await request(app.getHttpServer())
      .patch(`/special-price-lists/${replacement.body.id}/revisions/${replacementRevisionId}/approval`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "aprobar" })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/special-price-lists/${listId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ active: true })
      .expect(409);
  });
});
