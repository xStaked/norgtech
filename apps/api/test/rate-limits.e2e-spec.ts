import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { CommercialExpenseCategory, UserRole } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { RATE_LIMITS } from "../src/modules/whatsapp/rate-limits.constants";
import { PrismaService } from "../src/prisma/prisma.service";
import { R2StorageService } from "../src/modules/commercial-expenses/r2-storage.service";
import { CommercialExpenseExtractionService } from "../src/modules/commercial-expenses/commercial-expense-extraction.service";
import {
  MOCK_PASSWORD,
  MOCK_USERS,
  findMockUserByEmail,
  refreshTokenStub,
} from "./helpers/login-as";

// ---------------------------------------------------------------------------
// Unit: mapa de constantes (Ruling 3). Los límites son GENEROSOS por diseño:
// cortar un flujo real de un comercial sería peor que perdonar un burst
// razonable. Si alguien baja un límite de estas constantes más allá de un
// umbral sano, este test lo señala.
// ---------------------------------------------------------------------------

describe("RATE_LIMITS constants map", () => {
  it("keep generous limits (>=10) and a fixed 60s window in milliseconds", () => {
    for (const [key, entry] of Object.entries(RATE_LIMITS)) {
      expect(entry.ttl).toBe(60_000);
      expect(entry.limit).toBeGreaterThanOrEqual(10);
      expect(Number.isFinite(entry.limit)).toBe(true);
      expect(key.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// e2e: el Throttler global (APP_GUARD) también corre en la app de test, así
// que los 429 son reales. El guard corre ANTES del handler y de los guards de
// ruta, por lo que la petición se cuenta y el 429 aparece aunque el handler
// terminara en 404/500.
//
// Los humos de ráfaga NO dependen del límite exacto (los constantes se pueden
// afinar sin romper este suite): martillamos `limit + 6` peticiones y solo
// exigimos que APAREZCA al menos un 429 dentro de esa ventana, tolerante al
// índice exacto en que el bucket se bloquea.
// ---------------------------------------------------------------------------

describe("Throttle fino en endpoints caros", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let adminToken: string;
  let comercialToken: string;

  const hammerCount = (limit: number) => limit + 6;

  const postAgentExpense = (token: string) =>
    request(app.getHttpServer())
      .post("/whatsapp/agent/expenses")
      .set("Authorization", `Bearer ${token}`)
      .send({
        conversationId: "rate-conv-1",
        expenseDate: "2026-06-22",
        category: CommercialExpenseCategory.alimentacion,
        amount: 30000,
        description: "Almuerzo visita",
      });

  beforeAll(async () => {
    const noraCases: Array<Record<string, unknown>> = [];
    const expenses: Array<Record<string, unknown>> = [];
    const auditLogs: Array<Record<string, unknown>> = [];

    // El caso abierto SE RESETEA en cada búsqueda: cada request del agente pasa
    // por el camino completo (claim -> download -> createFromBuffer) sin que el
    // idempotente lo tape. Así el smoke refleja el flujo real por request.
    const freshOpenCase = () => ({
      id: "rate-case-1",
      conversationId: "rate-conv-1",
      type: "expense",
      status: "ready_for_review",
      extractedData: {},
      missingFields: [],
      attachments: [
        {
          provider: "kapso",
          kind: "image",
          providerMediaId: "rate-media-1",
          contentType: "image/jpeg",
          messageId: "rate-msg-1",
        },
      ],
      executedEntityId: null,
      executedEntityType: null,
      riskLevel: "medium",
    });

    const auditStub = {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const entry = { id: `audit-${auditLogs.length + 1}`, createdAt: new Date(), ...data };
        auditLogs.push(entry);
        return entry;
      },
    };
    const expenseCreate = async ({ data }: { data: Record<string, unknown> }) => {
      const expense = {
        id: `rate-exp-${expenses.length + 1}`,
        status: "pendiente",
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      expenses.push(expense);
      return expense;
    };

    const prismaStub = {
      user: {
        findUnique: async ({ where }: { where: { email?: string; id?: string } }) =>
          Object.values(MOCK_USERS).find(
            (u) => u.email === where.email || u.id === where.id,
          ) ?? findMockUserByEmail(where.email),
        findMany: async () => Object.values(MOCK_USERS),
      },
      refreshToken: refreshTokenStub(),
      // PDF: sin datos -> 404 del handler; el throttle igualmente cuenta (el
      // guard corre antes). El 200 real se cubre en reports.e2e-spec.ts.
      executiveReport: {
        findUnique: async () => null,
        findMany: async () => [],
      },
      // Analytics (JSON y CSV export): datos vacíos -> respuestas 200 livianas.
      order: { findMany: async () => [] },
      return: { findMany: async () => [] },
      invoice: { findMany: async () => [] },
      opportunity: { findMany: async () => [] },
      quote: { findMany: async () => [] },
      customer: { findUnique: async () => null },
      visit: { findUnique: async () => null },
      // WhatsApp agent (LLM/conversación).
      whatsAppConversation: {
        findUnique: async () => ({
          id: "rate-conv-1",
          account: { id: "rate-account-1", phoneNumberId: "rate-phone-1" },
        }),
      },
      noraConversationCase: {
        findFirst: async () => freshOpenCase(),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          noraCases.push({ ...data });
          return { id: "rate-case-1", ...data };
        },
        updateMany: async () => ({ count: 1 }),
      },
      commercialExpense: { create: expenseCreate },
      auditLog: auditStub,
      $queryRaw: async () => [{ id: "rate-case-1" }],
      $transaction: async <T>(callback: (tx: unknown) => Promise<T>) =>
        callback({
          customer: { findUnique: async () => null },
          visit: { findUnique: async () => null },
          commercialExpense: { create: expenseCreate },
          auditLog: auditStub,
          $queryRaw: async () => [{ id: "rate-case-1" }],
          noraConversationCase: {
            findFirst: async () => freshOpenCase(),
            update: async ({ data }: { data: Record<string, unknown> }) => {
              noraCases.push({ ...data });
              return { id: "rate-case-1", ...data };
            },
          },
        }),
    };

    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaStub)
      .overrideProvider(R2StorageService)
      .useValue({
        uploadExpenseSupport: async () => ({ bucket: "test-bucket", objectKey: "test-key" }),
        getObjectStream: async () => {
          throw new Error("not used");
        },
        deleteObject: async () => undefined,
      })
      .overrideProvider(CommercialExpenseExtractionService)
      .useValue({
        extract: async (file?: Express.Multer.File) => {
          if (!file) {
            throw new Error("support file required");
          }
          return {
            status: "completed",
            model: "gpt-4.1-mini",
            confidence: 0.91,
            fields: {
              expenseDate: { value: "2026-05-01", confidence: 0.93 },
              amount: { value: 25000, confidence: 0.94 },
              currency: { value: "COP", confidence: 0.98 },
              category: { value: CommercialExpenseCategory.alimentacion, confidence: 0.87 },
            },
            warnings: [],
          };
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    adminToken = (
      await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: MOCK_USERS[UserRole.administrador].email, password: MOCK_PASSWORD })
        .expect(200)
    ).body.accessToken;
    comercialToken = (
      await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: MOCK_USERS[UserRole.comercial].email, password: MOCK_PASSWORD })
        .expect(200)
    ).body.accessToken;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // Flujo normal (bajo el límite): peticiones en la ventana NO reciben 429 ni
  // quedan bloqueadas. Corre ANTES del martillo porque comparten bucket.
  it("GET /reports/:id/pdf: flujo normal sin 429 (mezcla 200/404 del stub)", async () => {
    for (let i = 0; i < 3; i++) {
      const res = await request(app.getHttpServer())
        .get("/reports/report-x/pdf")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).not.toBe(429);
    }
  });

  // La pantalla JSON de analítica NUNCA entra por el throttle de export:
  // un comercial revisando sus pantallas no compite con el bucket del CSV.
  it("GET /analytics/sales (format json): sin 429 aunque se consulte seguido", async () => {
    for (let i = 0; i < 12; i++) {
      const res = await request(app.getHttpServer())
        .get("/analytics/sales")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.status).not.toBe(429);
    }
  });

  it("GET /reports/:id/pdf: 429 al superar el límite de ruta (reportsPdf)", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < hammerCount(RATE_LIMITS.reportsPdf.limit); i++) {
      const res = await request(app.getHttpServer())
        .get("/reports/report-x/pdf")
        .set("Authorization", `Bearer ${adminToken}`);
      statuses.push(res.status);
      if (i === 0) {
        // La primera petición de la ráfaga no puede estar bloqueada.
        expect(res.status).not.toBe(429);
      }
    }
    // RED: sin throttle de ruta -> 0 peticiones 429 (el global 100 queda lejos).
    // GREEN: el bucket de ruta bloquea y deja de contar peticiones con 429.
    expect(statuses).toContain(429);
  });

  it("GET /analytics/sales?format=csv: 429 al superar el límite de export", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < hammerCount(RATE_LIMITS.analyticsCsv.limit); i++) {
      const res = await request(app.getHttpServer())
        .get("/analytics/sales?format=csv")
        .set("Authorization", `Bearer ${adminToken}`);
      statuses.push(res.status);
      if (i === 0) {
        expect(res.status).not.toBe(429);
      }
    }
    expect(statuses).toContain(429);
  });

  it("POST /commercial-expenses/extract-support: 429 al superar el límite OCR", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < hammerCount(RATE_LIMITS.expenseOcr.limit); i++) {
      const res = await request(app.getHttpServer())
        .post("/commercial-expenses/extract-support")
        .set("Authorization", `Bearer ${comercialToken}`)
        .attach("support", Buffer.from("pdf-bytes"), {
          filename: "soporte.png",
          contentType: "image/png",
        });
      statuses.push(res.status);
      if (i === 0) {
        expect(res.status).not.toBe(429);
      }
    }
    expect(statuses).toContain(429);
  });

  it("POST /whatsapp/agent/expenses: 429 al superar el límite del agente", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < hammerCount(RATE_LIMITS.noraAgent.limit); i++) {
      const res = await postAgentExpense(comercialToken);
      statuses.push(res.status);
      if (i === 0) {
        expect(res.status).not.toBe(429);
      }
    }
    expect(statuses).toContain(429);
  });
});
