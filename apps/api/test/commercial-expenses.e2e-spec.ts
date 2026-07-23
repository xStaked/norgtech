import { BadRequestException, INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import {
  CommercialExpenseCategory,
  CommercialExpenseStatus,
  Prisma,
  UserRole,
} from "@prisma/client";
import ExcelJS from "exceljs";
import { Readable } from "node:stream";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { CommercialExpenseExtractionService } from "../src/modules/commercial-expenses/commercial-expense-extraction.service";
import { CommercialExpensesService } from "../src/modules/commercial-expenses/commercial-expenses.service";
import { R2StorageService } from "../src/modules/commercial-expenses/r2-storage.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { refreshTokenStub } from "./helpers/login-as";
import { WhatsAppService } from "../src/modules/whatsapp/whatsapp.service";

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
    extractionConfidence: expense.extractionConfidence !== null
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
      refreshToken: refreshTokenStub(),
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
      .overrideProvider(CommercialExpenseExtractionService)
      .useValue({
        extract: async (file?: Express.Multer.File) => {
          if (!file) {
            throw new BadRequestException("Expense support file is required");
          }

          return {
            status: "completed",
            model: "gpt-4.1-mini",
            confidence: 0.91,
            fields: {
              expenseDate: { value: "2026-05-01", confidence: 0.93 },
              amount: { value: 25000, confidence: 0.94 },
              currency: { value: "COP", confidence: 0.98 },
              category: {
                value: CommercialExpenseCategory.alimentacion,
                confidence: 0.87,
              },
              description: {
                value: "Almuerzo proveedor Restaurante La 80",
                confidence: 0.76,
              },
              supplierName: { value: "Restaurante La 80", confidence: 0.9 },
              supplierNit: { value: "900123456-7", confidence: 0.82 },
              invoiceNumber: { value: "FE-1001", confidence: 0.8 },
              paymentMethod: { value: "tarjeta", confidence: 0.64 },
            },
            warnings: [],
          };
        },
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

  it("POST /commercial-expenses/extract-support returns extracted invoice fields", async () => {
    const response = await request(globalThis.__APP__)
      .post("/commercial-expenses/extract-support")
      .set("Authorization", `Bearer ${comercialToken}`)
      .attach("support", Buffer.from("image"), {
        filename: "factura.png",
        contentType: "image/png",
      })
      .expect(201);

    expect(response.body).toMatchObject({
      status: "completed",
      model: "gpt-4.1-mini",
      confidence: 0.91,
      fields: {
        amount: { value: 25000, confidence: 0.94 },
        supplierName: { value: "Restaurante La 80", confidence: 0.9 },
      },
      warnings: [],
    });
  });

  it("POST /commercial-expenses/extract-support rejects missing support", async () => {
    await request(globalThis.__APP__)
      .post("/commercial-expenses/extract-support")
      .set("Authorization", `Bearer ${comercialToken}`)
      .expect(400);
  });

  it("does not review extraction on create when only model whitespace is provided", async () => {
    const response = await request(globalThis.__APP__)
      .post("/commercial-expenses")
      .set("Authorization", `Bearer ${comercialToken}`)
      .field("expenseDate", "2026-05-01")
      .field("category", CommercialExpenseCategory.alimentacion)
      .field("amount", "25000")
      .field("description", "Almuerzo con cliente")
      .field("extractionModel", "   ")
      .attach("support", Buffer.from("image"), {
        filename: "support.png",
        contentType: "image/png",
      })
      .expect(201);

    expect(response.body).toMatchObject({
      extractionConfidence: null,
      extractionModel: null,
      extractionReviewedAt: null,
    });
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

  it("refreshes extraction review timestamp only when confidence changes", async () => {
    const created = await createExpense().expect(201);
    const originalReviewedAt = "2026-05-01T09:00:00.000Z";
    expenses[0].extractionReviewedAt = new Date(originalReviewedAt);

    const unchanged = await request(globalThis.__APP__)
      .patch(`/commercial-expenses/${created.body.id}`)
      .set("Authorization", `Bearer ${comercialToken}`)
      .send({ extractionConfidence: 0.91 })
      .expect(200);

    expect(Number(unchanged.body.extractionConfidence)).toBeCloseTo(0.91);
    expect(unchanged.body.extractionReviewedAt).toBe(originalReviewedAt);

    const changed = await request(globalThis.__APP__)
      .patch(`/commercial-expenses/${created.body.id}`)
      .set("Authorization", `Bearer ${comercialToken}`)
      .send({ extractionConfidence: 0.92 })
      .expect(200);

    expect(Number(changed.body.extractionConfidence)).toBeCloseTo(0.92);
    expect(changed.body.extractionReviewedAt).toBeTruthy();
    expect(changed.body.extractionReviewedAt).not.toBe(originalReviewedAt);

    expenses[0].extractionReviewedAt = new Date(originalReviewedAt);

    const cleared = await request(globalThis.__APP__)
      .patch(`/commercial-expenses/${created.body.id}`)
      .set("Authorization", `Bearer ${comercialToken}`)
      .send({ extractionConfidence: null })
      .expect(200);

    expect(cleared.body.extractionConfidence).toBeNull();
    expect(cleared.body.extractionReviewedAt).toBeTruthy();
    expect(cleared.body.extractionReviewedAt).not.toBe(originalReviewedAt);
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

  describe("CommercialExpensesService.updateStatus correction notification", () => {
    function build(currentStatus = "pendiente", postStatus = "requiere_correccion") {
      const expense = {
        id: "exp_1",
        status: currentStatus,
        submittedByUserId: "user_1",
        submittedBy: { id: "user_1", name: "Carlos", phone: "+573001000099" },
        amount: 50000,
        category: "alimentacion",
        expenseDate: new Date("2026-06-20"),
        description: "Almuerzo",
        supplierName: null, supplierNit: null, invoiceNumber: null, paymentMethod: null,
        reviewNote: null,
      };
      const tx = {
        commercialExpense: {
          findUnique: jest.fn().mockResolvedValue(expense),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      // second findUnique (post-update) returns the updated expense
      const postExpense = postStatus === "requiere_correccion"
        ? { ...expense, status: "requiere_correccion", reviewNote: "Falta NIT" }
        : { ...expense, status: postStatus };
      tx.commercialExpense.findUnique
        .mockResolvedValueOnce(expense)
        .mockResolvedValueOnce(postExpense);
      const prisma = { $transaction: (fn: (c: typeof tx) => unknown) => fn(tx) } as never;
      const auditService = { record: jest.fn() };
      const whatsapp = { notifyExpenseCorrection: jest.fn().mockResolvedValue(undefined) };
      const notifications = { emit: jest.fn().mockResolvedValue({ count: 0 }) };
      const service = new CommercialExpensesService(
        prisma,
        auditService as never,
        {} as never,
        {} as never,
        whatsapp as never,
        notifications as never,
      );
      (service as any).isControlRole = () => true;
      (service as any).assertCanRead = () => undefined;
      return { service, whatsapp };
    }

    it("notifies WhatsApp when transitioning to requiere_correccion", async () => {
      const { service, whatsapp } = build();
      await service.updateStatus({ id: "admin" } as never, "exp_1", {
        status: "requiere_correccion", reviewNote: "Falta NIT",
      } as never);
      expect(whatsapp.notifyExpenseCorrection).toHaveBeenCalledWith(
        expect.objectContaining({ id: "exp_1", reviewNote: "Falta NIT" }),
      );
    });

    it("does not notify on other transitions", async () => {
      // build() with current status "pendiente"; post-update findUnique returns "aprobado"
      const { service, whatsapp } = build("pendiente", "aprobado");
      await service.updateStatus({ id: "admin" } as never, "exp_1", { status: "aprobado" } as never)
        .catch(() => undefined);
      expect(whatsapp.notifyExpenseCorrection).not.toHaveBeenCalled();
    });
  });

  it("exports CSV and XLSX with expected content types", async () => {
    await createExpense().expect(201);
    // EXP-02: los encabezados exportados van en espanol legible, no en los
    // codigos snake_case internos.
    const expectedExportHeaders = [
      "Fecha",
      "Comercial",
      "Categoría",
      "Monto",
      "Moneda",
      "Proveedor",
      "NIT",
      "Número de factura",
      "Medio de pago",
      "Cliente",
      "Visita",
      "Estado",
      "Descripción",
      "Nota de revisión",
      "Fecha de revisión",
      "Revisor",
      "Confianza de extracción",
      "Modelo de extracción",
      "Fecha de creación",
    ] as const;
    const parseCsvRow = (row: string) => row.slice(1, -1).split('","');
    const binaryParser = (
      res: NodeJS.ReadableStream,
      callback: (err: Error | null, body?: Buffer) => void,
    ) => {
      const chunks: Buffer[] = [];

      res.on("data", (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      res.on("end", () => callback(null, Buffer.concat(chunks)));
      res.on("error", callback);
    };

    const csv = await request(globalThis.__APP__)
      .get("/commercial-expenses/export?format=csv")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(csv.headers["content-type"]).toContain("text/csv");
    const csvLines = csv.text.trim().split("\n");
    expect(csvLines[0]).toBe(expectedExportHeaders.join(","));
    const csvDataRow = parseCsvRow(csvLines[1]);
    expect(csvDataRow).toHaveLength(expectedExportHeaders.length);
    expect(csvDataRow).toEqual(
      expect.arrayContaining([
        "Restaurante La 80",
        "900123456-7",
        "FE-1001",
        "tarjeta",
      ]),
    );
    expect(csvDataRow.slice(5, 9)).toEqual([
      "Restaurante La 80",
      "900123456-7",
      "FE-1001",
      "tarjeta",
    ]);
    expect(csvDataRow[11]).toBe("pendiente");
    expect(csvDataRow[12]).toBe("Almuerzo con cliente");
    expect(csvDataRow[16]).toBe("0.91");
    expect(csvDataRow[17]).toBe("gpt-4.1-mini");
    // EXP-03: las fechas se exportan como dd/mm/aaaa HH:mm en hora de Colombia
    // (UTC-5). expenseDate "2026-05-01" => 2026-05-01T00:00:00Z => 30/04/2026 19:00.
    // Este valor es independiente de la TZ del proceso, por eso pasa bajo TZ=UTC.
    expect(csvDataRow[0]).toBe("30/04/2026 19:00");
    expect(csvDataRow[0]).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);

    const xlsx = await request(globalThis.__APP__)
      .get("/commercial-expenses/export?format=xlsx")
      .set("Authorization", `Bearer ${adminToken}`)
      .buffer(true)
      .parse(binaryParser as any)
      .expect(200);

    expect(xlsx.headers["content-type"]).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(xlsx.headers["content-disposition"]).toContain("gastos.xlsx");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(xlsx.body);

    const worksheet = workbook.getWorksheet("Gastos");
    expect(worksheet).toBeTruthy();

    const headerRow = worksheet!.getRow(1).values as Array<string | null>;
    expect(headerRow.slice(1)).toEqual([...expectedExportHeaders]);

    const dataRow = worksheet!.getRow(2);
    expect(dataRow.getCell(6).value).toBe("Restaurante La 80");
    expect(dataRow.getCell(7).value).toBe("900123456-7");
    expect(dataRow.getCell(8).value).toBe("FE-1001");
    expect(dataRow.getCell(9).value).toBe("tarjeta");
    // EXP-03: la celda de fecha (col 1) tambien en hora de Colombia dd/mm/aaaa HH:mm.
    expect(dataRow.getCell(1).value).toBe("30/04/2026 19:00");
  });
});
