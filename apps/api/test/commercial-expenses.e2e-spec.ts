import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import {
  CommercialExpenseCategory,
  CommercialExpenseStatus,
  Prisma,
  UserRole,
} from "@prisma/client";
import { Readable } from "node:stream";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { R2StorageService } from "../src/modules/commercial-expenses/r2-storage.service";
import { PrismaService } from "../src/prisma/prisma.service";

declare global {
  // eslint-disable-next-line no-var
  var __APP__: ReturnType<INestApplication["getHttpServer"]> | undefined;
}

type StoredExpense = Record<string, any>;
type UploadExpenseSupportCall = {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  body: Buffer | Uint8Array | Readable;
};

describe("CommercialExpenses", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let comercialToken: string;
  let otroComercialToken: string;
  let facturacionToken: string;
  let adminToken: string;
  const passwordHash =
    "$2a$10$eHlBtTx4HDVGtfsH8BSxG.JwwXsYNrKcdePOt3.1/./NPQ0CHs.w2";
  const expenses: StoredExpense[] = [];
  const auditLogs: Array<Record<string, unknown>> = [];
  const uploadExpenseSupportCalls: UploadExpenseSupportCall[] = [];

  const users = [
    {
      id: "admin-user-id",
      name: "Admin",
      email: "admin@norgtech.local",
      passwordHash,
      role: UserRole.administrador,
      active: true,
    },
    {
      id: "comercial-user-id",
      name: "Comercial",
      email: "comercial@norgtech.local",
      passwordHash,
      role: UserRole.comercial,
      active: true,
    },
    {
      id: "otro-comercial-user-id",
      name: "Otro Comercial",
      email: "otro@norgtech.local",
      passwordHash,
      role: UserRole.comercial,
      active: true,
    },
    {
      id: "facturacion-user-id",
      name: "Facturacion",
      email: "facturacion@norgtech.local",
      passwordHash,
      role: UserRole.facturacion,
      active: true,
    },
  ];

  const user = {
    findUnique: async ({
      where,
    }: {
      where: { email?: string; id?: string };
    }) => {
      const found = users.find(
        (item) => item.email === where.email || item.id === where.id,
      );
      return found ? { ...found } : null;
    },
  };

  const customer = {
    findUnique: async () => null,
  };

  const visit = {
    findUnique: async () => null,
  };

  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

  const shouldInclude = (
    include: Record<string, unknown> | undefined,
    relation: string,
  ) => Boolean(include?.[relation]);

  const hydrateExpense = (
    expense: StoredExpense,
    include?: Record<string, unknown>,
  ) => ({
    ...clone({
      ...expense,
      supports: undefined,
    }),
    amount: new Prisma.Decimal(expense.amount),
    extractionConfidence: expense.extractionConfidence
      ? new Prisma.Decimal(expense.extractionConfidence)
      : null,
    expenseDate: new Date(expense.expenseDate),
    reviewedAt: expense.reviewedAt ? new Date(expense.reviewedAt) : null,
    extractionReviewedAt: expense.extractionReviewedAt
      ? new Date(expense.extractionReviewedAt)
      : null,
    createdAt: new Date(expense.createdAt),
    updatedAt: new Date(expense.updatedAt),
    ...(shouldInclude(include, "submittedBy")
      ? {
          submittedBy: users.find(
            (item) => item.id === expense.submittedByUserId,
          ),
        }
      : {}),
    ...(shouldInclude(include, "reviewedBy")
      ? {
          reviewedBy: expense.reviewedByUserId
            ? users.find((item) => item.id === expense.reviewedByUserId)
            : null,
        }
      : {}),
    ...(shouldInclude(include, "customer") ? { customer: null } : {}),
    ...(shouldInclude(include, "visit") ? { visit: null } : {}),
    ...(shouldInclude(include, "supports")
      ? { supports: clone(expense.supports) }
      : {}),
  });

  const matchesWhere = (
    expense: StoredExpense,
    where?: Record<string, any>,
  ) => {
    if (!where) return true;
    if (where.id !== undefined && expense.id !== where.id) return false;
    if (where.status !== undefined && expense.status !== where.status) {
      return false;
    }
    if (
      where.submittedByUserId !== undefined &&
      expense.submittedByUserId !== where.submittedByUserId
    ) {
      return false;
    }
    if (where.category !== undefined && expense.category !== where.category) {
      return false;
    }
    if (
      where.customerId !== undefined &&
      expense.customerId !== where.customerId
    ) {
      return false;
    }
    if (where.visitId !== undefined && expense.visitId !== where.visitId) {
      return false;
    }
    if (where.expenseDate?.gte) {
      if (new Date(expense.expenseDate) < new Date(where.expenseDate.gte)) {
        return false;
      }
    }
    if (where.expenseDate?.lte) {
      if (new Date(expense.expenseDate) > new Date(where.expenseDate.lte)) {
        return false;
      }
    }
    return true;
  };

  const commercialExpense = {
    create: async ({
      data,
      include,
    }: {
      data: Record<string, any>;
      include?: Record<string, unknown>;
    }) => {
      const now = new Date("2026-05-01T12:00:00.000Z");
      const expense: StoredExpense = {
        id: `commercial-expense-${expenses.length + 1}`,
        expenseDate: data.expenseDate,
        category: data.category,
        amount: data.amount,
        currency: "COP",
        description: data.description,
        supplierName: data.supplierName ?? null,
        supplierNit: data.supplierNit ?? null,
        invoiceNumber: data.invoiceNumber ?? null,
        paymentMethod: data.paymentMethod ?? null,
        extractionConfidence: data.extractionConfidence ?? null,
        extractionModel: data.extractionModel ?? null,
        extractionReviewedAt: data.extractionReviewedAt ?? null,
        status: CommercialExpenseStatus.pendiente,
        reviewNote: null,
        reviewedAt: null,
        submittedByUserId: data.submittedByUserId,
        reviewedByUserId: null,
        customerId: data.customerId ?? null,
        visitId: data.visitId ?? null,
        createdBy: data.createdBy,
        updatedBy: data.updatedBy,
        createdAt: now,
        updatedAt: now,
        supports: [
          {
            id: `commercial-expense-support-${expenses.length + 1}`,
            expenseId: `commercial-expense-${expenses.length + 1}`,
            bucket: data.supports.create.bucket,
            objectKey: data.supports.create.objectKey,
            fileName: data.supports.create.fileName,
            contentType: data.supports.create.contentType,
            sizeBytes: data.supports.create.sizeBytes,
            uploadedByUserId: data.supports.create.uploadedBy.connect.id,
            createdAt: now,
          },
        ],
      };
      expenses.push(expense);
      return hydrateExpense(expense, include);
    },
    findUnique: async ({
      where: { id },
      include,
    }: {
      where: { id: string };
      include?: Record<string, unknown>;
    }) => {
      const found = expenses.find((expense) => expense.id === id);
      return found ? hydrateExpense(found, include) : null;
    },
    findMany: async ({
      where,
      include,
    }: {
      where?: Record<string, any>;
      include?: Record<string, unknown>;
    } = {}) =>
      expenses
        .filter((expense) => matchesWhere(expense, where))
        .map((expense) => hydrateExpense(expense, include)),
    updateMany: async ({
      where,
      data,
    }: {
      where: Record<string, any>;
      data: Record<string, any>;
    }) => {
      const matches = expenses.filter((expense) => matchesWhere(expense, where));
      for (const expense of matches) {
        Object.assign(expense, data, { updatedAt: new Date() });
      }
      return { count: matches.length };
    },
  };

  beforeAll(async () => {
    const prismaStub = {
      user,
      customer,
      visit,
      commercialExpense,
      auditLog: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const entry = {
            id: `audit-${auditLogs.length + 1}`,
            createdAt: new Date(),
            ...data,
          };
          auditLogs.push(entry);
          return entry;
        },
      },
      $transaction: async <T>(callback: (tx: any) => Promise<T>) =>
        callback({
          customer,
          visit,
          commercialExpense,
          auditLog: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
              const entry = {
                id: `audit-${auditLogs.length + 1}`,
                createdAt: new Date(),
                ...data,
              };
              auditLogs.push(entry);
              return entry;
            },
          },
        }),
    };

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaStub)
      .overrideProvider(R2StorageService)
      .useValue({
        uploadExpenseSupport: async (input: UploadExpenseSupportCall) => ({
          bucket: "test-bucket",
          objectKey: `commercial-expenses/support-${uploadExpenseSupportCalls.push(
            input,
          )}.png`,
        }),
        getObjectStream: async () => Readable.from(Buffer.from("support")),
        deleteObject: async () => undefined,
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    globalThis.__APP__ = app.getHttpServer();

    comercialToken = (
      await request(globalThis.__APP__)
        .post("/auth/login")
        .send({ email: "comercial@norgtech.local", password: "Admin123*" })
        .expect(200)
    ).body.accessToken;
    otroComercialToken = (
      await request(globalThis.__APP__)
        .post("/auth/login")
        .send({ email: "otro@norgtech.local", password: "Admin123*" })
        .expect(200)
    ).body.accessToken;
    facturacionToken = (
      await request(globalThis.__APP__)
        .post("/auth/login")
        .send({ email: "facturacion@norgtech.local", password: "Admin123*" })
        .expect(200)
    ).body.accessToken;
    adminToken = (
      await request(globalThis.__APP__)
        .post("/auth/login")
        .send({ email: "admin@norgtech.local", password: "Admin123*" })
        .expect(200)
    ).body.accessToken;
  });

  afterAll(async () => {
    globalThis.__APP__ = undefined;
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => {
    expenses.splice(0);
    auditLogs.splice(0);
    uploadExpenseSupportCalls.splice(0);
  });

  const createExpense = () =>
    request(globalThis.__APP__)
      .post("/commercial-expenses")
      .set("Authorization", `Bearer ${comercialToken}`)
      .field("expenseDate", "2026-05-01")
      .field("category", CommercialExpenseCategory.alimentacion)
      .field("amount", "25000")
      .field("description", "Almuerzo con cliente")
      .field("supplierName", "Restaurante La 80")
      .field("supplierNit", "900123456-7")
      .field("invoiceNumber", "FE-1001")
      .field("paymentMethod", "tarjeta")
      .field("extractionConfidence", "0.91")
      .field("extractionModel", "gpt-4.1-mini")
      .attach("support", Buffer.from("image"), {
        filename: "support.png",
        contentType: "image/png",
      });

  it("GET /commercial-expenses rejects unauthenticated requests", async () => {
    await request(globalThis.__APP__).get("/commercial-expenses").expect(401);
  });

  it("POST /commercial-expenses rejects missing support", async () => {
    await request(globalThis.__APP__)
      .post("/commercial-expenses")
      .set("Authorization", `Bearer ${comercialToken}`)
      .field("expenseDate", "2026-05-01")
      .field("category", CommercialExpenseCategory.alimentacion)
      .field("amount", "25000")
      .field("description", "Almuerzo con cliente")
      .expect(400);
  });

  it("POST /commercial-expenses allows comercial to create with image support", async () => {
    const response = await createExpense().expect(201);

    expect(response.body).toMatchObject({
      status: CommercialExpenseStatus.pendiente,
      submittedByUserId: "comercial-user-id",
      category: CommercialExpenseCategory.alimentacion,
      description: "Almuerzo con cliente",
      supplierName: "Restaurante La 80",
      supplierNit: "900123456-7",
      invoiceNumber: "FE-1001",
      paymentMethod: "tarjeta",
      extractionModel: "gpt-4.1-mini",
    });
    expect(Number(response.body.extractionConfidence)).toBeCloseTo(0.91);
    expect(response.body.extractionReviewedAt).toBeTruthy();
    expect(response.body.supports).toHaveLength(1);
    expect(response.body.supports[0]).toMatchObject({
      bucket: "test-bucket",
      objectKey: "commercial-expenses/support-1.png",
      contentType: "image/png",
      fileName: "support.png",
      sizeBytes: 5,
    });
    expect(uploadExpenseSupportCalls).toHaveLength(1);
    expect(uploadExpenseSupportCalls[0]).toMatchObject({
      fileName: "support.png",
      contentType: "image/png",
      sizeBytes: 5,
    });
    expect(uploadExpenseSupportCalls[0].body).toEqual(Buffer.from("image"));
  });

  it("does not allow another comercial to get the expense", async () => {
    const created = await createExpense().expect(201);

    await request(globalThis.__APP__)
      .get(`/commercial-expenses/${created.body.id}`)
      .set("Authorization", `Bearer ${otroComercialToken}`)
      .expect(403);
  });

  it("requires a review note for correction or rejection statuses", async () => {
    const created = await createExpense().expect(201);

    await request(globalThis.__APP__)
      .patch(`/commercial-expenses/${created.body.id}/status`)
      .set("Authorization", `Bearer ${facturacionToken}`)
      .send({ status: CommercialExpenseStatus.requiere_correccion })
      .expect(400);

    await request(globalThis.__APP__)
      .patch(`/commercial-expenses/${created.body.id}/status`)
      .set("Authorization", `Bearer ${facturacionToken}`)
      .send({ status: CommercialExpenseStatus.rechazado })
      .expect(400);
  });

  it("does not allow comercial to update expense status", async () => {
    const created = await createExpense().expect(201);

    await request(globalThis.__APP__)
      .patch(`/commercial-expenses/${created.body.id}/status`)
      .set("Authorization", `Bearer ${comercialToken}`)
      .send({ status: CommercialExpenseStatus.aprobado })
      .expect(403);
  });

  it("allows facturacion to request correction and comercial edit returns to pendiente", async () => {
    const created = await createExpense().expect(201);

    const correction = await request(globalThis.__APP__)
      .patch(`/commercial-expenses/${created.body.id}/status`)
      .set("Authorization", `Bearer ${facturacionToken}`)
      .send({
        status: CommercialExpenseStatus.requiere_correccion,
        reviewNote: "Adjuntar factura legible",
      })
      .expect(200);

    expect(correction.body).toMatchObject({
      status: CommercialExpenseStatus.requiere_correccion,
      reviewNote: "Adjuntar factura legible",
      reviewedByUserId: "facturacion-user-id",
    });

    const edited = await request(globalThis.__APP__)
      .patch(`/commercial-expenses/${created.body.id}`)
      .set("Authorization", `Bearer ${comercialToken}`)
      .send({ description: "Almuerzo con cliente - factura corregida" })
      .expect(200);

    expect(edited.body).toMatchObject({
      status: CommercialExpenseStatus.pendiente,
      reviewNote: null,
      reviewedAt: null,
      reviewedByUserId: null,
      description: "Almuerzo con cliente - factura corregida",
    });
  });

  it("returns summary totals for control role", async () => {
    await createExpense().expect(201);

    const response = await request(globalThis.__APP__)
      .get("/commercial-expenses/summary")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body.totalAmount).toBeGreaterThan(0);
    expect(response.body.byCategory.alimentacion).toBeGreaterThan(0);
  });

  it("exports CSV and XLSX with expected content types", async () => {
    await createExpense().expect(201);

    const csv = await request(globalThis.__APP__)
      .get("/commercial-expenses/export?format=csv")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.text).toContain("fecha,comercial,categoria");
    expect(csv.text).toContain("alimentacion");

    const xlsx = await request(globalThis.__APP__)
      .get("/commercial-expenses/export?format=xlsx")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(xlsx.headers["content-type"]).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(xlsx.headers["content-disposition"]).toContain("gastos.xlsx");
  });
});
