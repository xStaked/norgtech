import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary() {
    const now = new Date();

    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const day = now.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() + diffToMonday);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const [
      openQuotes,
      pipelineAgg,
      closedDeals,
      activeOrders,
      weeklyVisits,
      pendingFollowUps,
      recentLogs,
    ] = await Promise.all([
      this.prisma.quote.count({
        where: {
          status: { in: ["abierta", "en_negociacion"] },
        },
      }),
      this.prisma.opportunity.aggregate({
        where: {
          stage: { notIn: ["venta_cerrada", "perdida"] },
        },
        _sum: { estimatedValue: true },
      }),
      this.prisma.opportunity.count({
        where: {
          stage: "venta_cerrada",
          closedAt: { gte: thirtyDaysAgo },
        },
      }),
      this.prisma.order.count({
        where: {
          status: { not: "entregado" },
        },
      }),
      this.prisma.visit.count({
        where: {
          scheduledAt: { gte: startOfWeek, lte: endOfWeek },
        },
      }),
      this.prisma.followUpTask.count({
        where: {
          status: "pendiente",
          dueAt: { lte: now },
        },
      }),
      this.prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    const userIds = [...new Set(recentLogs.map((l) => l.actorUserId))];
    const users =
      userIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true },
          })
        : [];

    const userMap = new Map(users.map((u) => [u.id, u.name]));

    const recentActivity = recentLogs.map((log) => ({
      id: log.id,
      entityType: log.entityType,
      entityId: log.entityId,
      action: log.action,
      actorName: userMap.get(log.actorUserId) || "Desconocido",
      createdAt: log.createdAt,
    }));

    return {
      openQuotes,
      pipelineValue: Number(pipelineAgg._sum.estimatedValue ?? 0),
      closedDeals,
      activeOrders,
      weeklyVisits,
      pendingFollowUps,
      recentActivity,
    };
  }
}
