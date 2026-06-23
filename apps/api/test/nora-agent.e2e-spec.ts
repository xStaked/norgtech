import { Test } from "@nestjs/testing";
import { NoraConversationCaseStatus } from "@prisma/client";
import { PrismaService } from "../src/prisma/prisma.service";
import { NoraCaseService } from "../src/modules/whatsapp/nora-case.service";

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
