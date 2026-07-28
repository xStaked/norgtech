import { StreamableFile } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { Response } from "express";
import { AnalyticsController } from "../src/modules/analytics/analytics.controller";
import { ResolvedFilters } from "../src/modules/analytics/analytics.shared";
import { SalesService } from "../src/modules/analytics/sales.service";
import { SellerPerformanceService } from "../src/modules/analytics/seller-performance.service";
import { SellerReportService } from "../src/modules/analytics/seller-report.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { SellerGoalsService } from "../src/modules/seller-goals/seller-goals.service";
import { AuthUser } from "../src/modules/auth/types/authenticated-request";

/**
 * Informe de desempeño en PDF (`GET /analytics/seller-performance?format=pdf`).
 *
 * Lo que NO puede fallar: un comercial baja SU informe y nada mas. El PDF pasa
 * por el mismo `resolveFilters` que las 4 pantallas, asi que este spec verifica
 * que el acotado llega intacto a cada consulta que alimenta el documento — si
 * alguna se saltara el filtro forzado, el PDF filtraria datos de otro vendedor.
 *
 * Es puro: no toca base de datos, todas las dependencias son dobles.
 */

const seller: AuthUser = { id: "u-seller", email: "s@x.co", role: UserRole.comercial };
const admin: AuthUser = { id: "u-admin", email: "a@x.co", role: UserRole.administrador };

const SALES = {
  totals: {
    netRevenue: 128_400_000,
    orderCount: 42,
    customerCount: 17,
    avgTicket: 3_057_142,
    avgDiscountPercent: 4.2,
  },
  previous: { label: "", from: "2025-04-01", to: "2025-06-30", netRevenue: 101_000_000, orderCount: 33, changePercent: 27.1 },
  breakdowns: {
    byCustomer: [
      { customerName: "Avícola El Roble S.A.S.", netRevenue: 41_200_000, orderCount: 9, lastOrderDate: "2026-06-18T00:00:00.000Z", sharePercent: 32.1 },
      { customerName: "Porcícola Guaduas", netRevenue: 22_800_000, orderCount: 6, lastOrderDate: "2026-06-02T00:00:00.000Z", sharePercent: 17.8 },
    ],
    byCustomerTotal: 17,
  },
};

const PERFORMANCE = {
  totals: {
    netRevenue: 128_400_000,
    expenseTotal: 6_100_000,
    expenseRatio: 4.8,
    pendingExpenseTotal: 350_000,
    visitsScheduled: 40,
    visitsCompleted: 31,
    visitCompliance: 77.5,
    tasksOverdue: 3,
  },
  breakdowns: { bySeller: [{ sellerId: "u-seller", sellerName: "Ana Vendedora", dormantCustomers: 5 }] },
};

const GOAL = {
  userId: "u-seller",
  sellerName: "Ana Vendedora",
  periodType: "mensual",
  periodValue: "2026-06",
  targetAmount: 150_000_000,
  soldAmount: 128_400_000,
  remainingAmount: 21_600_000,
  percentage: 85.6,
};

/** Devuelve el controller mas los espias de cada consulta que arma el PDF. */
function build() {
  const salesFilters: ResolvedFilters[] = [];
  const performanceFilters: ResolvedFilters[] = [];
  const goalCalls: { user: AuthUser; userId: string }[] = [];
  const nameLookups: string[] = [];

  const sales = {
    getSales: jest.fn(async (filters: ResolvedFilters) => {
      salesFilters.push(filters);
      return SALES;
    }),
  } as unknown as SalesService;

  const performance = {
    getSellerPerformance: jest.fn(async (filters: ResolvedFilters) => {
      performanceFilters.push(filters);
      return { ...PERFORMANCE, csvRows: [] };
    }),
  } as unknown as SellerPerformanceService;

  const goals = {
    getProgress: jest.fn(async (user: AuthUser, userId: string) => {
      goalCalls.push({ user, userId });
      // Misma regla que el servicio real: un comercial solo lee su propia meta.
      if (user.role === UserRole.comercial && user.id !== userId) {
        throw new Error("Insufficient permissions");
      }
      return GOAL;
    }),
  } as unknown as SellerGoalsService;

  const prisma = {
    user: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        nameLookups.push(where.id);
        return { name: where.id === "u-seller" ? "Ana Vendedora" : "Otro Vendedor" };
      }),
    },
  } as unknown as PrismaService;

  const controller = new AnalyticsController(
    sales,
    {} as never,
    {} as never,
    performance,
    new SellerReportService(prisma, sales, performance, goals),
  );

  return { controller, salesFilters, performanceFilters, goalCalls, nameLookups };
}

const response = { setHeader: jest.fn() } as unknown as Response;

async function toBuffer(file: unknown): Promise<Buffer> {
  expect(file).toBeInstanceOf(StreamableFile);
  const chunks: Buffer[] = [];
  for await (const chunk of (file as StreamableFile).getStream()) {
    chunks.push(Buffer.from(chunk as Buffer));
  }
  return Buffer.concat(chunks);
}

describe("Analitica · informe de desempeño en PDF", () => {
  describe("acotado por rol", () => {
    it("un comercial que pide el PDF de OTRO vendedor recibe el suyo", async () => {
      const harness = build();

      const file = await harness.controller.getSellerPerformance(
        seller,
        { from: "2026-04-01", to: "2026-06-30", sellerUserId: "u-otro", format: "pdf" },
        response,
      );

      // Ninguna de las consultas que alimentan el PDF ve "u-otro".
      expect(harness.salesFilters[0].sellerUserId).toBe("u-seller");
      expect(harness.performanceFilters[0].sellerUserId).toBe("u-seller");
      expect(harness.goalCalls).toEqual([{ user: seller, userId: "u-seller" }]);
      expect(harness.nameLookups).toEqual(["u-seller"]);

      const pdf = await toBuffer(file);
      expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    });

    it("un comercial tampoco puede pedir el consolidado del equipo", async () => {
      const harness = build();

      await harness.controller.getSellerPerformance(seller, { format: "pdf" }, response);

      // Sin `sellerUserId` en el query el consolidado seria de toda la empresa:
      // el forzado lo convierte igual en el informe del propio comercial.
      expect(harness.salesFilters[0].sellerUserId).toBe("u-seller");
      expect(harness.performanceFilters[0].sellerUserId).toBe("u-seller");
    });

    it("un administrador si puede bajar el informe de un vendedor concreto", async () => {
      const harness = build();

      const file = await harness.controller.getSellerPerformance(
        admin,
        { sellerUserId: "u-otro", format: "pdf" },
        response,
      );

      expect(harness.salesFilters[0].sellerUserId).toBe("u-otro");
      expect(harness.goalCalls).toEqual([{ user: admin, userId: "u-otro" }]);
      expect((await toBuffer(file)).subarray(0, 5).toString()).toBe("%PDF-");
    });
  });

  describe("contenido", () => {
    it("sin meta cargada el informe se genera igual", async () => {
      const harness = build();
      // El servicio real tira NotFound cuando el vendedor no tiene meta.
      const goals = (harness.controller as unknown as {
        sellerReportService: { sellerGoalsService: { getProgress: jest.Mock } };
      }).sellerReportService.sellerGoalsService;
      goals.getProgress = jest.fn(async () => {
        throw new Error("No seller goals found");
      });

      const pdf = await toBuffer(
        await harness.controller.getSellerPerformance(seller, { format: "pdf" }, response),
      );
      expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
      expect(pdf.length).toBeGreaterThan(1000);
    });

    it("sin `format=pdf` la pantalla sigue devolviendo JSON", async () => {
      const harness = build();
      const body = await harness.controller.getSellerPerformance(seller, {}, response);
      expect(body).not.toBeInstanceOf(StreamableFile);
      expect((body as { totals: { netRevenue: number } }).totals.netRevenue).toBe(128_400_000);
    });
  });
});
