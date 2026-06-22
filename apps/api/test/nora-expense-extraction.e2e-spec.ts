import { NoraExpenseExtractionService } from "../src/modules/whatsapp/nora-expense-extraction.service";

type AnyRecord = Record<string, unknown>;

const buildMessage = (payload: AnyRecord) =>
  ({
    id: "message-expense-1",
    conversationId: "conversation-sergio",
    body: "[Imagen]",
    payload,
  }) as never;

const imagePayload = {
  mediaKind: "image",
  mediaId: "image-direct-1",
  contentType: "image/jpeg",
  caption: "Factura almuerzo",
};

const completedExtraction = {
  status: "completed" as const,
  model: "gpt-4.1-mini",
  confidence: 0.92,
  fields: {
    amount: { value: 25000, confidence: 0.95 },
    expenseDate: { value: "2026-04-24", confidence: 0.9 },
    category: { value: "alimentacion", confidence: 0.8 },
    description: { value: "Almuerzo cliente", confidence: 0.7 },
    supplierName: { value: "Carlos Enrique Ruiz", confidence: 0.6 },
  },
  warnings: [],
};

const makeDeps = () => {
  const prisma = {
    whatsAppConversation: {
      findUnique: jest.fn().mockResolvedValue({
        id: "conversation-sergio",
        account: { phoneNumberId: "phone-number-1" },
      }),
    },
  };
  const extractionProvider = {
    extract: jest.fn().mockResolvedValue(completedExtraction),
  };
  const noraCaseService = {
    updateCase: jest.fn().mockResolvedValue({}),
  };
  const whatsAppService = {
    downloadMedia: jest.fn().mockResolvedValue(Buffer.from("fake-image-bytes")),
    sendAgentReply: jest.fn().mockResolvedValue({}),
  };

  const service = new NoraExpenseExtractionService(
    prisma as never,
    extractionProvider as never,
    noraCaseService as never,
    whatsAppService as never,
  );

  return { service, prisma, extractionProvider, noraCaseService, whatsAppService };
};

describe("NoraExpenseExtractionService", () => {
  it("downloads the Kapso media, runs OCR and updates the case with extracted data", async () => {
    const { service, extractionProvider, noraCaseService, whatsAppService } = makeDeps();

    await service.extractForCase({
      caseId: "case-expense-1",
      conversationId: "conversation-sergio",
      message: buildMessage(imagePayload),
    });

    expect(whatsAppService.downloadMedia).toHaveBeenCalledWith(
      "phone-number-1",
      "image-direct-1",
    );
    expect(extractionProvider.extract).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: "image/jpeg",
        buffer: expect.any(Buffer),
      }),
    );

    expect(noraCaseService.updateCase).toHaveBeenCalledTimes(1);
    const [caseId, update] = noraCaseService.updateCase.mock.calls[0];
    expect(caseId).toBe("case-expense-1");
    expect(update.extractedData).toEqual(
      expect.objectContaining({
        amount: 25000,
        expenseDate: "2026-04-24",
        category: "alimentacion",
        description: "Almuerzo cliente",
        supplierName: "Carlos Enrique Ruiz",
      }),
    );
    expect(update.missingFields).toEqual([]);

    expect(whatsAppService.sendAgentReply).toHaveBeenCalledTimes(1);
    const [, reply] = whatsAppService.sendAgentReply.mock.calls[0];
    expect(reply.toLowerCase()).not.toContain("hola");
    expect(reply).toContain("25.000");
  });

  it("keeps amount as a missing field when OCR cannot read it", async () => {
    const { service, extractionProvider, noraCaseService } = makeDeps();
    extractionProvider.extract.mockResolvedValueOnce({
      status: "low_confidence",
      model: "gpt-4.1-mini",
      confidence: 0.2,
      fields: {
        category: { value: "otros", confidence: 0.3 },
      },
      warnings: ["No se pudo leer la factura con suficiente confianza."],
    });

    await service.extractForCase({
      caseId: "case-expense-1",
      conversationId: "conversation-sergio",
      message: buildMessage(imagePayload),
    });

    const [, update] = noraCaseService.updateCase.mock.calls[0];
    expect(update.missingFields).toEqual(
      expect.arrayContaining(["amount", "expenseDate", "description"]),
    );
  });

  it("sends a fallback reply and does not update the case when download or OCR fails", async () => {
    const { service, whatsAppService, noraCaseService } = makeDeps();
    whatsAppService.downloadMedia.mockRejectedValueOnce(new Error("kapso down"));

    await expect(
      service.extractForCase({
        caseId: "case-expense-1",
        conversationId: "conversation-sergio",
        message: buildMessage(imagePayload),
      }),
    ).resolves.toBeUndefined();

    expect(noraCaseService.updateCase).not.toHaveBeenCalled();
    expect(whatsAppService.sendAgentReply).toHaveBeenCalledTimes(1);
    const [, reply] = whatsAppService.sendAgentReply.mock.calls[0];
    expect(reply.toLowerCase()).toContain("valor");
  });

  it("does nothing when the message has no media attachment", async () => {
    const { service, whatsAppService, extractionProvider, noraCaseService } = makeDeps();

    await service.extractForCase({
      caseId: "case-expense-1",
      conversationId: "conversation-sergio",
      message: buildMessage({}),
    });

    expect(whatsAppService.downloadMedia).not.toHaveBeenCalled();
    expect(extractionProvider.extract).not.toHaveBeenCalled();
    expect(noraCaseService.updateCase).not.toHaveBeenCalled();
    expect(whatsAppService.sendAgentReply).not.toHaveBeenCalled();
  });
});
