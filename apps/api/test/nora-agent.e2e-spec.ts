// eslint-disable-next-line @typescript-eslint/no-require-imports
const jsonwebtoken = require("jsonwebtoken") as { verify(token: string, secret: string): unknown };
import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { CommercialExpenseCategory, NoraConversationCaseStatus, UserRole } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { refreshTokenStub } from "./helpers/login-as";
import { R2StorageService } from "../src/modules/commercial-expenses/r2-storage.service";
import { NoraCaseService } from "../src/modules/whatsapp/nora-case.service";
import { CommercialExpensesService } from "../src/modules/commercial-expenses/commercial-expenses.service";
import { AuditService } from "../src/modules/audit/audit.service";
import { CommercialExpensesExportService } from "../src/modules/commercial-expenses/commercial-expenses-export.service";
import { AuthService } from "../src/modules/auth/auth.service";
import { AUTH_JWT_SECRET } from "../src/modules/auth/auth.constants";
import { NoraExpenseExecutionService } from "../src/modules/whatsapp/nora-expense-execution.service";
import { NoraAgentController } from "../src/modules/whatsapp/nora-agent.controller";
import { WhatsAppService } from "../src/modules/whatsapp/whatsapp.service";
import { NotificationsService } from "../src/modules/notifications/notifications.service";

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
        { provide: WhatsAppService, useValue: { notifyExpenseCorrection: jest.fn() } },
        { provide: NotificationsService, useValue: { emit: jest.fn().mockResolvedValue({ count: 0 }) } },
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

// ---------------------------------------------------------------------------
// Task 3: AuthService.mintScopedToken
// ---------------------------------------------------------------------------

describe("AuthService.mintScopedToken", () => {
  it("signs a short-lived token scoped to the user", async () => {
    const users = [
      { id: "user_1", email: "c@x.com", role: "comercial", active: true },
    ];
    const prisma = {
      user: {
        findUnique: jest.fn().mockImplementation(({ where }: { where: { id?: string; email?: string } }) => {
          return Promise.resolve(users.find((u) => u.id === where.id || u.email === where.email) ?? null);
        }),
      },
    } as unknown as PrismaService;

    const moduleRef = await Test.createTestingModule({
      providers: [AuthService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const service = moduleRef.get(AuthService);

    const token = await service.mintScopedToken("user_1");
    const decoded = jsonwebtoken.verify(token, AUTH_JWT_SECRET) as Record<string, unknown>;

    expect(decoded.sub).toBe("user_1");
    expect(decoded.role).toBe("comercial");
    expect(decoded.email).toBe("c@x.com");
  });

  it("rejects missing users", async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;

    const moduleRef = await Test.createTestingModule({
      providers: [AuthService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const service = moduleRef.get(AuthService);

    await expect(service.mintScopedToken("nope")).rejects.toThrow();
  });

  it("rejects inactive users", async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: "user_2",
          email: "x@x.com",
          role: "comercial",
          active: false,
        }),
      },
    } as unknown as PrismaService;

    const moduleRef = await Test.createTestingModule({
      providers: [AuthService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const service = moduleRef.get(AuthService);

    await expect(service.mintScopedToken("user_2")).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Task 4: NoraExpenseExecutionService.executeFromWhatsApp
// ---------------------------------------------------------------------------

const baseExpenseDto = {
  expenseDate: "2026-04-24",
  category: CommercialExpenseCategory.alimentacion,
  amount: 25000,
  description: "Almuerzo",
} as never;

function buildExpenseExecutionService() {
  const caseRecord = {
    id: "case_1",
    type: "expense",
    status: "ready_for_review",
    attachments: [
      {
        provider: "kapso",
        kind: "image",
        providerMediaId: "media_1",
        contentType: "image/jpeg",
        messageId: "msg_1",
      },
    ],
    executedEntityId: null,
    executedEntityType: null,
    extractedData: {},
  };
  const noraCaseService = {
    findOpenCase: jest.fn().mockResolvedValue(caseRecord),
    updateCase: jest.fn().mockResolvedValue(undefined),
    claimForExecution: jest.fn().mockResolvedValue(true),
  };
  const expensesService = {
    createFromBuffer: jest.fn().mockResolvedValue({ id: "exp_1", status: "pendiente" }),
  };
  const whatsAppService = {
    downloadMedia: jest.fn().mockResolvedValue(Buffer.from("img")),
  };
  const conversations = {
    findUnique: jest.fn().mockResolvedValue({ account: { phoneNumberId: "pn_1" } }),
  };
  const prismaStub = { whatsAppConversation: conversations } as unknown as PrismaService;

  const service = new NoraExpenseExecutionService(
    noraCaseService as never,
    expensesService as never,
    whatsAppService as never,
    prismaStub,
  );

  return { service, noraCaseService, expensesService, whatsAppService, caseRecord };
}

describe("NoraExpenseExecutionService.executeFromWhatsApp", () => {
  it("creates the expense and marks the case executed", async () => {
    const { service, noraCaseService, expensesService } = buildExpenseExecutionService();

    const result = await service.executeFromWhatsApp({
      user: { id: "user_1" } as never,
      conversationId: "conv_1",
      dto: baseExpenseDto,
    });

    expect(expensesService.createFromBuffer).toHaveBeenCalled();
    expect(noraCaseService.updateCase).toHaveBeenCalledWith(
      "case_1",
      expect.objectContaining({
        status: NoraConversationCaseStatus.executed,
        executedEntityType: "CommercialExpense",
        executedEntityId: "exp_1",
      }),
    );
    expect(result).toEqual({ id: "exp_1", status: "pendiente", alreadyExisted: false });
  });

  it("is idempotent when the case already has an executedEntityId", async () => {
    const { service, expensesService } = buildExpenseExecutionService();

    // Re-wire findOpenCase to an already-executed case
    (service.noraCaseService.findOpenCase as jest.Mock).mockResolvedValue({
      id: "case_1",
      executedEntityId: "exp_existing",
    });

    const result = await service.executeFromWhatsApp({
      user: { id: "user_1" } as never,
      conversationId: "conv_1",
      dto: baseExpenseDto,
    });

    expect(expensesService.createFromBuffer).not.toHaveBeenCalled();
    expect(result).toEqual({ id: "exp_existing", status: "pendiente", alreadyExisted: true });
  });

  it("releases the claim and rethrows when expense creation fails", async () => {
    const { service, noraCaseService, expensesService } = buildExpenseExecutionService();
    (expensesService.createFromBuffer as jest.Mock).mockRejectedValue(
      new Error("R2 upload failed"),
    );

    await expect(
      service.executeFromWhatsApp({
        user: { id: "user_1" } as never,
        conversationId: "conv_1",
        dto: baseExpenseDto,
      }),
    ).rejects.toThrow("R2 upload failed");

    // Claim must be released so the commercial can retry (not left stuck).
    expect(noraCaseService.updateCase).toHaveBeenCalledWith(
      "case_1",
      expect.objectContaining({ executedEntityType: null }),
    );
  });
});

// ---------------------------------------------------------------------------
// Task 4 (update path): NoraExpenseExecutionService.updateFromWhatsApp
// ---------------------------------------------------------------------------

describe("NoraExpenseExecutionService.updateFromWhatsApp", () => {
  it("updates the expense and closes the open case", async () => {
    const noraCaseService = {
      findOpenCase: jest.fn().mockResolvedValue({ id: "case_1" }),
      updateCase: jest.fn().mockResolvedValue(undefined),
    };
    const expensesService = {
      update: jest.fn().mockResolvedValue({ id: "exp_1", status: "pendiente" }),
    };
    const service = new NoraExpenseExecutionService(
      noraCaseService as never, expensesService as never, {} as never, {} as never,
    );

    const result = await service.updateFromWhatsApp({
      user: { id: "user_1" } as never,
      conversationId: "conv_1",
      expenseId: "exp_1",
      dto: { supplierNit: "900123456" } as never,
    });

    expect(expensesService.update).toHaveBeenCalledWith(
      { id: "user_1" }, "exp_1", { supplierNit: "900123456" },
    );
    expect(noraCaseService.updateCase).toHaveBeenCalledWith(
      "case_1",
      expect.objectContaining({
        status: NoraConversationCaseStatus.executed,
        executedEntityType: "CommercialExpense",
        executedEntityId: "exp_1",
      }),
    );
    expect(result).toEqual({ id: "exp_1", status: "pendiente" });
  });
});

// ---------------------------------------------------------------------------
// Task 5: NoraAgentController delegates to NoraExpenseExecutionService
// ---------------------------------------------------------------------------

describe("NoraAgentController", () => {
  it("delegates expense execution to the execution service", async () => {
    const execution = {
      executeFromWhatsApp: jest
        .fn()
        .mockResolvedValue({ id: "exp_1", status: "pendiente", alreadyExisted: false }),
    };
    const controller = new NoraAgentController(execution as never);

    const result = await controller.createExpense({ id: "user_1" } as never, {
      conversationId: "conv_1",
      expenseDate: "2026-04-24",
      category: CommercialExpenseCategory.alimentacion,
      amount: 25000,
      description: "Almuerzo",
    } as never);

    expect(execution.executeFromWhatsApp).toHaveBeenCalledWith({
      user: { id: "user_1" },
      conversationId: "conv_1",
      dto: expect.objectContaining({ amount: 25000 }),
    });
    expect(result).toEqual({ id: "exp_1", status: "pendiente", alreadyExisted: false });
  });
});

// ---------------------------------------------------------------------------
// Task 12: End-to-end scenario — receipt -> confirm -> expense created (idempotent)
// ---------------------------------------------------------------------------

describe("scenario: receipt -> confirm -> expense created (idempotent)", () => {
  it("creates once and is idempotent on re-confirm", async () => {
    const created = { id: "exp_1", status: "pendiente" };
    let storedExecutedId: string | null = null;
    let claimed = false;

    const noraCaseService = {
      findOpenCase: jest.fn().mockImplementation(async () => ({
        id: "case_1",
        type: "expense",
        status: storedExecutedId ? "executed" : "ready_for_review",
        attachments: [
          { provider: "kapso", kind: "image", providerMediaId: "media_1", contentType: "image/jpeg" },
        ],
        executedEntityId: storedExecutedId,
        executedEntityType: storedExecutedId ? "CommercialExpense" : null,
        extractedData: {},
      })),
      updateCase: jest.fn().mockImplementation(async (_id: string, input: { executedEntityId?: string }) => {
        if (input.executedEntityId) storedExecutedId = input.executedEntityId;
      }),
      // First call wins (claimed=false→true, returns true); second call returns false.
      claimForExecution: jest.fn().mockImplementation(async () => {
        if (claimed) return false;
        claimed = true;
        return true;
      }),
    };
    const expensesService = { createFromBuffer: jest.fn().mockResolvedValue(created) };
    const whatsAppService = { downloadMedia: jest.fn().mockResolvedValue(Buffer.from("img")) };
    const prisma = {
      whatsAppConversation: {
        findUnique: jest.fn().mockResolvedValue({ account: { phoneNumberId: "pn_1" } }),
      },
    };

    const service = new NoraExpenseExecutionService(
      noraCaseService as never,
      expensesService as never,
      whatsAppService as never,
      prisma as never,
    );

    const dto = {
      expenseDate: "2026-04-24",
      category: CommercialExpenseCategory.alimentacion,
      amount: 25000,
      description: "Almuerzo",
    } as never;

    const first = await service.executeFromWhatsApp({ user: { id: "u" } as never, conversationId: "conv_1", dto });
    const second = await service.executeFromWhatsApp({ user: { id: "u" } as never, conversationId: "conv_1", dto });

    expect(first).toEqual({ id: "exp_1", status: "pendiente", alreadyExisted: false });
    expect(second.alreadyExisted).toBe(true);
    expect(expensesService.createFromBuffer).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// FIX 2: lost-claim scenario — claimForExecution returns false on first call
// ---------------------------------------------------------------------------

describe("NoraExpenseExecutionService.executeFromWhatsApp — lost claim race", () => {
  it("does not call createFromBuffer and returns alreadyExisted:true when claim fails", async () => {
    const caseWithNoId = {
      id: "case_race",
      type: "expense",
      status: "ready_for_review",
      attachments: [
        { provider: "kapso", kind: "image", providerMediaId: "media_1", contentType: "image/jpeg" },
      ],
      executedEntityId: null,
      executedEntityType: null,
      extractedData: {},
    };

    const noraCaseService = {
      findOpenCase: jest.fn().mockResolvedValue(caseWithNoId),
      updateCase: jest.fn(),
      claimForExecution: jest.fn().mockResolvedValue(false), // lost the race
    };
    const expensesService = { createFromBuffer: jest.fn() };
    const whatsAppService = { downloadMedia: jest.fn() };
    const prisma = {
      whatsAppConversation: {
        findUnique: jest.fn().mockResolvedValue({ account: { phoneNumberId: "pn_1" } }),
      },
    };

    const service = new NoraExpenseExecutionService(
      noraCaseService as never,
      expensesService as never,
      whatsAppService as never,
      prisma as never,
    );

    const result = await service.executeFromWhatsApp({
      user: { id: "u" } as never,
      conversationId: "conv_race",
      dto: baseExpenseDto,
    });

    expect(expensesService.createFromBuffer).not.toHaveBeenCalled();
    expect(result.alreadyExisted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Task 6: Full-app routing test — POST /whatsapp/agent/expenses
// ---------------------------------------------------------------------------

describe("POST /whatsapp/agent/expenses (full-app)", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let comercialToken: string;
  let clienteToken: string;

  const passwordHash = "$2a$10$eHlBtTx4HDVGtfsH8BSxG.JwwXsYNrKcdePOt3.1/./NPQ0CHs.w2";

  const users = [
    {
      id: "agent-comercial-id",
      name: "Vendedor",
      email: "vendedor@norgtech.local",
      phone: "+573001000099",
      passwordHash,
      role: UserRole.comercial,
      active: true,
    },
    {
      id: "agent-tecnico-id",
      name: "Tecnico",
      email: "tecnico@norgtech.local",
      phone: "+573001000098",
      passwordHash,
      role: UserRole.tecnico,
      active: true,
    },
  ];

  // Mutable arrays reset in beforeAll
  const noraCases: Array<Record<string, unknown>> = [];
  const expenses: Array<Record<string, unknown>> = [];
  const auditLogs: Array<Record<string, unknown>> = [];

  const conversation = {
    id: "agent-conv-1",
    accountId: "agent-account-1",
    waId: "573001000099",
    phone: "+573001000099",
    senderName: "Vendedor",
    status: "nuevo",
    customerId: null,
    contactId: null,
    assignedToUserId: "agent-comercial-id",
    lastMessageAt: new Date("2026-06-22T10:00:00.000Z"),
    createdAt: new Date("2026-06-22T09:00:00.000Z"),
    updatedAt: new Date("2026-06-22T10:00:00.000Z"),
    account: { id: "agent-account-1", phoneNumberId: "pn-agent-1" },
  };

  const openExpenseCase = {
    id: "agent-case-1",
    conversationId: "agent-conv-1",
    type: "expense",
    status: "ready_for_review",
    extractedData: {},
    missingFields: [],
    attachments: [
      {
        provider: "kapso",
        kind: "image",
        providerMediaId: "media-agent-1",
        contentType: "image/jpeg",
        messageId: "msg-agent-1",
      },
    ],
    executedEntityId: null,
    executedEntityType: null,
    riskLevel: "medium",
    createdAt: new Date("2026-06-22T09:30:00.000Z"),
    updatedAt: new Date("2026-06-22T09:30:00.000Z"),
  };

  beforeAll(async () => {
    // Seed mutable arrays
    noraCases.push({ ...openExpenseCase });
    expenses.splice(0);
    auditLogs.splice(0);

    const prismaStub = {
      user: {
        findUnique: async ({ where }: { where: { email?: string; id?: string } }) =>
          users.find((u) => u.email === where.email || u.id === where.id) ?? null,
        findMany: async () => users,
      },
      refreshToken: refreshTokenStub(),
      whatsAppConversation: {
        findUnique: async ({ where }: { where: { id: string } }) =>
          where.id === conversation.id ? { ...conversation } : null,
      },
      noraConversationCase: {
        findFirst: async ({ where }: { where?: Record<string, unknown> } = {}) => {
          const statusFilter = (where?.status as { in?: string[] } | undefined)?.in;
          return (
            noraCases
              .filter((c) => !where?.conversationId || c.conversationId === where.conversationId)
              .filter((c) => !statusFilter || statusFilter.includes(String(c.status)))
              .sort((a, b) => (b.updatedAt as Date).getTime() - (a.updatedAt as Date).getTime())[0] ??
            null
          );
        },
        update: async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const idx = noraCases.findIndex((c) => c.id === where.id);
          if (idx === -1) return null;
          noraCases[idx] = { ...noraCases[idx], ...data, updatedAt: new Date() };
          return noraCases[idx];
        },
        // Atomic CAS claim for claimForExecution
        updateMany: async ({
          where,
          data,
        }: {
          where: { id: string; executedEntityType: null };
          data: Record<string, unknown>;
        }) => {
          const idx = noraCases.findIndex(
            (c) => c.id === where.id && c.executedEntityType === null,
          );
          if (idx === -1) return { count: 0 };
          noraCases[idx] = { ...noraCases[idx], ...data, updatedAt: new Date() };
          return { count: 1 };
        },
      },
      commercialExpense: {
        create: async ({ data, include: _include }: { data: Record<string, unknown>; include?: unknown }) => {
          const expense = {
            id: `exp-${expenses.length + 1}`,
            status: "pendiente",
            createdAt: new Date(),
            updatedAt: new Date(),
            ...data,
          };
          expenses.push(expense);
          return expense;
        },
      },
      auditLog: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const entry = { id: `audit-${auditLogs.length + 1}`, createdAt: new Date(), ...data };
          auditLogs.push(entry);
          return entry;
        },
      },
      customer: { findUnique: async () => null },
      visit: { findUnique: async () => null },
      $queryRaw: jest.fn(async () => [{ id: "agent-case-1" }]),
      $transaction: async <T>(callback: (tx: unknown) => Promise<T>) => {
        const tx = {
          customer: { findUnique: async () => null },
          visit: { findUnique: async () => null },
          commercialExpense: {
            create: async ({ data, include: _include }: { data: Record<string, unknown>; include?: unknown }) => {
              const expense = {
                id: `exp-${expenses.length + 1}`,
                status: "pendiente",
                createdAt: new Date(),
                updatedAt: new Date(),
                ...data,
              };
              expenses.push(expense);
              return expense;
            },
          },
          auditLog: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
              const entry = { id: `audit-${auditLogs.length + 1}`, createdAt: new Date(), ...data };
              auditLogs.push(entry);
              return entry;
            },
          },
          $queryRaw: jest.fn(async () => [{ id: "agent-case-1" }]),
          noraConversationCase: {
            findFirst: async ({ where }: { where?: Record<string, unknown> } = {}) => {
              return noraCases.find((c) => c.id === where?.id) ?? null;
            },
            update: async ({
              where,
              data,
            }: {
              where: { id: string };
              data: Record<string, unknown>;
            }) => {
              const idx = noraCases.findIndex((c) => c.id === where.id);
              if (idx === -1) return null;
              noraCases[idx] = { ...noraCases[idx], ...data, updatedAt: new Date() };
              return noraCases[idx];
            },
          },
        };
        return callback(tx);
      },
    };

    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaStub)
      .overrideProvider(R2StorageService)
      .useValue({
        uploadExpenseSupport: async () => ({ bucket: "test-bucket", objectKey: "test-key" }),
        getObjectStream: async () => { throw new Error("not used"); },
        deleteObject: async () => undefined,
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "vendedor@norgtech.local", password: "Admin123*" })
      .expect(200);
    comercialToken = loginRes.body.accessToken;

    const clienteLoginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "tecnico@norgtech.local", password: "Admin123*" })
      .expect(200);
    clienteToken = clienteLoginRes.body.accessToken;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it("rejects requests without an Authorization header with 401", async () => {
    await request(app.getHttpServer())
      .post("/whatsapp/agent/expenses")
      .send({
        conversationId: "agent-conv-1",
        expenseDate: "2026-06-22",
        category: CommercialExpenseCategory.alimentacion,
        amount: 30000,
        description: "Almuerzo visita",
      })
      .expect(401);
  });

  it("rejects a JWT for a non-allowed role (tecnico) with 403", async () => {
    await request(app.getHttpServer())
      .post("/whatsapp/agent/expenses")
      .set("Authorization", `Bearer ${clienteToken}`)
      .send({
        conversationId: "agent-conv-1",
        expenseDate: "2026-06-22",
        category: CommercialExpenseCategory.alimentacion,
        amount: 30000,
        description: "Almuerzo visita",
      })
      .expect(403);
  });

  it("creates an expense and marks the case executed when called with a valid JWT", async () => {
    const response = await request(app.getHttpServer())
      .post("/whatsapp/agent/expenses")
      .set("Authorization", `Bearer ${comercialToken}`)
      .send({
        conversationId: "agent-conv-1",
        expenseDate: "2026-06-22",
        category: CommercialExpenseCategory.alimentacion,
        amount: 30000,
        description: "Almuerzo visita",
      })
      .expect((res) => {
        if (res.status !== 200 && res.status !== 201) {
          throw new Error(`Expected 200/201 but got ${res.status}: ${JSON.stringify(res.body)}`);
        }
      });

    expect(response.body).toMatchObject({
      id: expect.any(String),
      status: "pendiente",
      alreadyExisted: false,
    });

    // Case should now be marked executed
    const updatedCase = noraCases.find((c) => c.id === "agent-case-1");
    expect(updatedCase?.status).toBe(NoraConversationCaseStatus.executed);
    expect(updatedCase?.executedEntityType).toBe("CommercialExpense");
    expect(updatedCase?.executedEntityId).toBe(response.body.id);
  });
});
