import { Test } from "@nestjs/testing";
import { CommercialExpenseCategory, NoraConversationCaseStatus } from "@prisma/client";
import { PrismaService } from "../src/prisma/prisma.service";
import { NoraCaseService } from "../src/modules/whatsapp/nora-case.service";
import { CommercialExpensesService } from "../src/modules/commercial-expenses/commercial-expenses.service";
import { AuditService } from "../src/modules/audit/audit.service";
import { R2StorageService } from "../src/modules/commercial-expenses/r2-storage.service";
import { CommercialExpensesExportService } from "../src/modules/commercial-expenses/commercial-expenses-export.service";

// ---------------------------------------------------------------------------
// Task 1: NoraCaseService.updateCase persists executedEntityType/executedEntityId
// ---------------------------------------------------------------------------

describe("NoraCaseService.updateCase executed fields", () => {
  it("persists executedEntityType and executedEntityId", async () => {
    const existing = {
      id: "case_1",
      extractedData: {},
      missingFields: [],
      attachments: [],
    };
    const update = jest.fn().mockResolvedValue({ ...existing, status: "executed" });
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: "case_1" }]),
      noraConversationCase: {
        findFirst: jest.fn().mockResolvedValue(existing),
        update,
      },
    };
    const prisma = {
      $transaction: (fn: (c: typeof tx) => unknown) => fn(tx),
    } as unknown as PrismaService;

    const moduleRef = await Test.createTestingModule({
      providers: [NoraCaseService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const service = moduleRef.get(NoraCaseService);

    await service.updateCase("case_1", {
      status: NoraConversationCaseStatus.executed,
      executedEntityType: "CommercialExpense",
      executedEntityId: "exp_1",
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "case_1" },
        data: expect.objectContaining({
          status: NoraConversationCaseStatus.executed,
          executedEntityType: "CommercialExpense",
          executedEntityId: "exp_1",
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Task 2: CommercialExpensesService.createFromBuffer
// ---------------------------------------------------------------------------

describe("CommercialExpensesService.createFromBuffer", () => {
  it("uploads the buffer and creates an expense", async () => {
    const uploaded = { bucket: "b", objectKey: "k" };
    const storageService = {
      uploadExpenseSupport: jest.fn().mockResolvedValue(uploaded),
      deleteObject: jest.fn(),
    };
    const created = { id: "exp_1", status: "pendiente" };
    const tx = {
      commercialExpense: { create: jest.fn().mockResolvedValue(created) },
    };
    const prisma = { $transaction: (fn: (c: typeof tx) => unknown) => fn(tx) };
    const auditService = { record: jest.fn() };
    const exportService = {};

    const moduleRef = await Test.createTestingModule({
      providers: [
        CommercialExpensesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
        { provide: R2StorageService, useValue: storageService },
        { provide: CommercialExpensesExportService, useValue: exportService },
      ],
    }).compile();

    const service = moduleRef.get(CommercialExpensesService);

    // Stub relation validation to a no-op.
    (service as any).validateOptionalRelations = async () => undefined;

    const result = await service.createFromBuffer(
      { id: "user_1" } as never,
      {
        expenseDate: "2026-04-24",
        category: CommercialExpenseCategory.alimentacion,
        amount: 25000,
        description: "Almuerzo",
      } as never,
      { buffer: Buffer.from("img"), originalname: "soporte.jpg", mimetype: "image/jpeg", size: 3 },
    );

    expect(storageService.uploadExpenseSupport).toHaveBeenCalled();
    expect(tx.commercialExpense.create).toHaveBeenCalled();
    expect(result).toEqual(created);
  });
});
