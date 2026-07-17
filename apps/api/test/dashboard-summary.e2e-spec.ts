import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { FollowUpTaskStatus, UserRole, VisitStatus } from "@prisma/client";
import request from "supertest";
import { DashboardController } from "../src/modules/dashboard/dashboard.controller";
import { DashboardService } from "../src/modules/dashboard/dashboard.service";
import { JwtAuthGuard } from "../src/modules/auth/jwt-auth.guard";
import { RolesGuard } from "../src/modules/auth/roles.guard";
import { PrismaService } from "../src/prisma/prisma.service";
import { SellerGoalsService } from "../src/modules/seller-goals/seller-goals.service";
import { dayRangeInZone, followUpTaskOverdueWhere, weekRangeInZone } from "../src/shared/overdue";

/**
 * GET /dashboard/summary no tenia NINGUNA cobertura: por eso DASH-03, DASH-05,
 * DASH-06 y las tarjetas pendiente/vencida intercambiadas llegaron a produccion
 * con la suite en verde.
 *
 * NOTA DE ZONA HORARIA: esta maquina corre en America/Bogota, asi que un test
 * que compare limites de dia contra literales pasaria IGUAL con el bug vivo
 * (server-local == Bogota aqui; solo se rompe en un host UTC, o sea produccion).
 * Por eso los limites se afirman por DELEGACION: el `where` capturado debe ser
 * exactamente el que produce la regla compartida (`dayRangeInZone`/
 * `weekRangeInZone`). Eso es independiente de la zona del proceso y prueba lo
 * que importa: que este servicio NO reimplementa la regla. La correccion de la
 * regla en si vive en overdue.e2e-spec.ts.
 */
// 02:00Z del 2 de junio = 21:00 del 1 de junio en Bogota: el dia UTC y el dia
// de Bogota son DISTINTOS en este instante.
const NOW = new Date("2026-06-02T02:00:00.000Z");

describe("Dashboard summary (GET /dashboard/summary)", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let calls: Record<string, any[]>;

  const tasks = [
    // pendiente y ya vencio -> VENCIDA
    {
      id: "task-past-pending",
      status: FollowUpTaskStatus.pendiente,
      dueAt: new Date("2026-05-30T10:00:00.000Z"),
      assignedToUserId: "admin-user-id",
      title: "Vencida real",
      customer: { displayName: "Agro Norte" },
    },
    // pendiente y aun no vence -> PENDIENTE
    {
      id: "task-future-pending",
      status: FollowUpTaskStatus.pendiente,
      dueAt: new Date("2026-06-10T10:00:00.000Z"),
      assignedToUserId: "admin-user-id",
      title: "Pendiente real",
      customer: { displayName: "Agro Norte" },
    },
    // completada: la zanjo un humano, no cuenta en ninguna
    {
      id: "task-done",
      status: FollowUpTaskStatus.completada,
      dueAt: new Date("2026-05-01T10:00:00.000Z"),
      assignedToUserId: "admin-user-id",
      title: "Completada",
      customer: { displayName: "Agro Norte" },
    },
    // marcada 'vencida' a mano por el difunto markOverdue y ya vencio -> VENCIDA
    {
      id: "task-manual-overdue",
      status: FollowUpTaskStatus.vencida,
      dueAt: new Date("2026-05-15T10:00:00.000Z"),
      assignedToUserId: "admin-user-id",
      title: "Vencida historica",
      customer: { displayName: "Agro Norte" },
    },
    // marcada 'vencida' pero reprogramada al futuro -> vuelve a PENDIENTE
    {
      id: "task-manual-overdue-rescheduled",
      status: FollowUpTaskStatus.vencida,
      dueAt: new Date("2026-06-20T10:00:00.000Z"),
      assignedToUserId: "admin-user-id",
      title: "Reprogramada",
      customer: { displayName: "Agro Norte" },
    },
    // de otro usuario: no debe salir en "mi cola"
    {
      id: "task-other-user",
      status: FollowUpTaskStatus.pendiente,
      dueAt: new Date("2026-06-11T10:00:00.000Z"),
      assignedToUserId: "seller-1",
      title: "De otro",
      customer: { displayName: "Cultivos Sur" },
    },
  ];

  const matchTask = (task: any, where: any = {}) => {
    if (where.status?.notIn && where.status.notIn.includes(task.status)) return false;
    if (where.dueAt?.gte && task.dueAt < where.dueAt.gte) return false;
    if (where.dueAt?.lt && !(task.dueAt < where.dueAt.lt)) return false;
    if (where.assignedToUserId && task.assignedToUserId !== where.assignedToUserId) return false;
    return true;
  };

  beforeAll(async () => {
    jest.useFakeTimers({ now: NOW });
    calls = {
      quoteCount: [],
      opportunityAggregate: [],
      opportunityCount: [],
      orderCount: [],
      visitCount: [],
      followUpTaskCount: [],
      followUpTaskFindMany: [],
      visitFindMany: [],
    };

    const prismaStub = {
      user: {
        findUnique: async () => null,
        findMany: async () => [],
      },
      quote: {
        count: async (args: any) => {
          calls.quoteCount.push(args?.where);
          return 4;
        },
      },
      opportunity: {
        aggregate: async (args: any) => {
          calls.opportunityAggregate.push(args?.where);
          return { _sum: { estimatedValue: 7500 } };
        },
        count: async (args: any) => {
          calls.opportunityCount.push(args?.where);
          return 3;
        },
      },
      order: {
        count: async (args: any) => {
          calls.orderCount.push(args?.where);
          return 9;
        },
      },
      visit: {
        count: async (args: any) => {
          calls.visitCount.push(args?.where);
          return 2;
        },
        findMany: async (args: any) => {
          calls.visitFindMany.push(args?.where);
          return [];
        },
      },
      followUpTask: {
        count: async (args: any) => {
          calls.followUpTaskCount.push(args?.where);
          return tasks.filter((task) => matchTask(task, args?.where)).length;
        },
        findMany: async (args: any) => {
          calls.followUpTaskFindMany.push(args?.where);
          return tasks.filter((task) => matchTask(task, args?.where));
        },
      },
      auditLog: {
        findMany: async () => [],
      },
      return: { findMany: async () => [] },
      orderItem: { findMany: async () => [] },
      customer: { findMany: async () => [] },
      product: { findMany: async () => [] },
    };

    moduleRef = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: prismaStub },
        { provide: SellerGoalsService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: any) => {
          context.switchToHttp().getRequest().user = {
            sub: "admin-user-id",
            email: "admin@norgtech.local",
            role: UserRole.administrador,
          };
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (moduleRef) await moduleRef.close();
    jest.useRealTimers();
  });

  const getSummary = (query = "") =>
    request(app.getHttpServer())
      .get(`/dashboard/summary${query}`)
      .set("Authorization", "Bearer test-token")
      .expect(200);

  // Bug encontrado por la auditoria: `pendiente AND dueAt <= now` ES el conjunto
  // de vencidas. Las dos tarjetas estaban intercambiadas.
  describe("pending vs overdue tiles", () => {
    it("counts as PENDING only open tasks whose due date has not passed", async () => {
      const response = await getSummary();

      // El contador es GLOBAL (no por usuario): task-future-pending +
      // task-manual-overdue-rescheduled + task-other-user.
      expect(response.body.pendingFollowUps).toBe(3);
      // El valor del bug era 1 (solo task-past-pending, que en realidad esta vencida).
      expect(response.body.pendingFollowUps).not.toBe(1);
    });

    it("counts as OVERDUE every open task whose due date has passed", async () => {
      const response = await getSummary();

      // task-past-pending + task-manual-overdue
      expect(response.body.overdueFollowUps).toBe(2);
    });

    it("derives overdue with the shared rule instead of reading status=vencida", async () => {
      await getSummary();

      const overdueWhere = calls.followUpTaskCount[1];
      expect(overdueWhere).toEqual(followUpTaskOverdueWhere(NOW));
      // El contador viejo leia la columna que ya nadie escribe.
      expect(overdueWhere).not.toEqual({ status: FollowUpTaskStatus.vencida });
    });

    it("never counts a task as both pending and overdue", async () => {
      const response = await getSummary();

      const open = tasks.filter((t) => t.status !== FollowUpTaskStatus.completada).length;
      expect(response.body.pendingFollowUps + response.body.overdueFollowUps).toBe(open);
    });
  });

  // DASH-03
  describe("my work queue (DASH-03)", () => {
    it("filters the queue by the current user and excludes settled tasks", async () => {
      await getSummary();

      expect(calls.followUpTaskFindMany[0]).toEqual({
        assignedToUserId: "admin-user-id",
        status: { notIn: [FollowUpTaskStatus.completada] },
      });
    });

    it("returns the current user's open tasks and not other users'", async () => {
      const response = await getSummary();

      const ids = response.body.myQueue.map((item: { id: string }) => item.id);
      expect(ids).toContain("task-past-pending");
      expect(ids).toContain("task-future-pending");
      expect(ids).not.toContain("task-other-user");
      expect(ids).not.toContain("task-done");
      expect(response.body.myQueue.length).toBeGreaterThan(0);
    });

    it("scopes upcoming visits in the queue to the current user", async () => {
      await getSummary();

      expect(calls.visitFindMany[0]).toMatchObject({
        assignedToUserId: "admin-user-id",
        status: VisitStatus.programada,
      });
    });
  });

  // DASH-06
  describe("closed deals (DASH-06)", () => {
    it("counts won opportunities by closedAt within the last 30 days", async () => {
      const response = await getSummary();

      const where = calls.opportunityCount[0];
      expect(where.stage).toBe("venta_cerrada");
      expect(where.closedAt.gte).toEqual(new Date("2026-05-03T02:00:00.000Z"));
      expect(response.body.closedDeals).toBe(3);
    });
  });

  // Limites de dia/semana: se afirma la DELEGACION, no la aritmetica (ver nota
  // de cabecera: esta maquina corre en Bogota y no distinguiria el bug).
  describe("day/week boundaries come from the shared Bogota rule", () => {
    it("uses weekRangeInZone for the weekly visits counter", async () => {
      await getSummary();

      const { start, end } = weekRangeInZone(NOW);
      expect(calls.visitCount[0]).toEqual({ scheduledAt: { gte: start, lte: end } });
    });

    it("uses dayRangeInZone for the today's visits counter", async () => {
      await getSummary();

      const { start, end } = dayRangeInZone(NOW);
      expect(calls.visitCount[1]).toEqual({
        scheduledAt: { gte: start, lte: end },
        status: VisitStatus.programada,
      });
    });

    it("resolves 'today' as the Bogota day, which here is not the UTC day", async () => {
      await getSummary();

      // NOW es 2026-06-02T02:00Z, pero en Bogota siguen siendo las 21:00 del 1.
      // El dia de Bogota empieza a las 05:00Z del 1 de junio.
      expect(calls.visitCount[1].scheduledAt.gte.toISOString()).toBe(
        "2026-06-01T05:00:00.000Z",
      );
      expect(calls.visitCount[1].scheduledAt.lte.toISOString()).toBe(
        "2026-06-02T04:59:59.999Z",
      );
    });
  });

  // DASH-05
  describe("company scoping (DASH-05)", () => {
    it("applies companyId to the orders counter, the only entity with a company relation", async () => {
      await getSummary("?companyId=company-a");

      expect(calls.orderCount.at(-1)).toEqual({
        status: { not: "entregado" },
        companyId: "company-a",
      });
    });

    it("omits the company filter entirely when none is selected", async () => {
      await getSummary();

      expect(calls.orderCount.at(-1)).toEqual({ status: { not: "entregado" } });
    });

    /**
     * Este test DOCUMENTA una limitacion, no un acierto: Quote, Opportunity,
     * Visit, FollowUpTask y AuditLog no tienen relacion con Company en el
     * schema, asi que estos contadores son globales aunque haya empresa
     * seleccionada. Se afirma explicitamente para que nadie "arregle" el filtro
     * inventando una relacion indirecta (p.ej. Opportunity -> orders ->
     * companyId), que haria desaparecer del pipeline toda oportunidad sin
     * pedidos. Si algun dia se añade companyId a esas tablas, este test debe
     * cambiar a proposito.
     */
    it("does not fake a company filter on entities that have no company relation", async () => {
      await getSummary("?companyId=company-a");

      expect(calls.quoteCount.at(-1)).not.toHaveProperty("companyId");
      expect(calls.opportunityAggregate.at(-1)).not.toHaveProperty("companyId");
      expect(calls.opportunityCount.at(-1)).not.toHaveProperty("companyId");
      expect(calls.visitCount.at(-1)).not.toHaveProperty("companyId");
      expect(calls.followUpTaskCount.at(-1)).not.toHaveProperty("companyId");
      expect(calls.followUpTaskFindMany.at(-1)).not.toHaveProperty("companyId");
    });
  });
});
