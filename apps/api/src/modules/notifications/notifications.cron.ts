import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { NotificationType } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
  BOGOTA_TIME_ZONE,
  followUpTaskOverdueWhere,
  visitOverdueWhere,
} from "../../shared/overdue";
import { CustomerGoalsService } from "../customer-goals/customer-goals.service";
import { NotificationsService } from "./notifications.service";

/** Dias que sobrevive una notificacion ya leida antes de purgarse. */
const READ_RETENTION_DAYS = 60;

/**
 * Barrido diario de lo que el reloj vuelve notificable.
 *
 * REGLA DURA: este cron solo INSERTA en `Notification` y purga leidas viejas.
 * No escribe `status` de ninguna entidad. `shared/overdue.ts` sigue siendo la
 * unica definicion de "vencido" y este modulo la consume; si algun dia esta
 * clase empieza a escribir `Visit.status`, la lista de vencidos y el contador
 * dejan de cuadrar (es el bug AGEN-02 otra vez).
 */
@Injectable()
export class NotificationsCron {
  private readonly logger = new Logger(NotificationsCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly customerGoals: CustomerGoalsService,
  ) {}

  @Cron("0 7 * * *", { timeZone: BOGOTA_TIME_ZONE })
  async runDaily(): Promise<void> {
    await this.sweep(new Date());
  }

  /** `now` inyectado: los tests no dependen del reloj del proceso. */
  async sweep(now: Date): Promise<void> {
    await this.sweepOverdueVisits(now);
    await this.sweepOverdueFollowUps(now);
    await this.sweepAchievedGoals(now);
    await this.purgeRead(now);
  }

  private async sweepOverdueVisits(now: Date): Promise<void> {
    const visits = await this.prisma.visit.findMany({
      where: { ...visitOverdueWhere(now), assignedToUserId: { not: null } },
      select: {
        id: true,
        assignedToUserId: true,
        scheduledAt: true,
        customer: { select: { displayName: true } },
      },
    });

    // ponytail: un emit por visita. Con miles de vencidas conviene un solo
    // createMany; hasta entonces esto es una consulta por fila una vez al dia.
    for (const visit of visits) {
      if (!visit.assignedToUserId) continue;

      await this.notifications.emit({
        userIds: [visit.assignedToUserId],
        type: NotificationType.visita_vencida,
        title: `Visita vencida: ${visit.customer.displayName}`,
        body: `Programada para ${this.formatDate(visit.scheduledAt)} y sin registro.`,
        entityType: "visit",
        entityId: visit.id,
      });
    }
  }

  private async sweepOverdueFollowUps(now: Date): Promise<void> {
    const tasks = await this.prisma.followUpTask.findMany({
      where: {
        ...followUpTaskOverdueWhere(now),
        assignedToUserId: { not: null },
      },
      select: {
        id: true,
        title: true,
        assignedToUserId: true,
        dueAt: true,
        customer: { select: { displayName: true } },
      },
    });

    for (const task of tasks) {
      if (!task.assignedToUserId) continue;

      await this.notifications.emit({
        userIds: [task.assignedToUserId],
        type: NotificationType.seguimiento_vencido,
        title: `Seguimiento vencido: ${task.title}`,
        body: `${task.customer.displayName} — vencia el ${this.formatDate(task.dueAt)}.`,
        entityType: "follow_up_task",
        entityId: task.id,
      });
    }
  }

  private async sweepAchievedGoals(now: Date): Promise<void> {
    const goals = await this.prisma.customerGoal.findMany({
      select: {
        id: true,
        customerId: true,
        periodType: true,
        periodValue: true,
        customer: { select: { displayName: true, assignedToUserId: true } },
      },
    });

    for (const goal of goals) {
      const ownerId = goal.customer.assignedToUserId;
      if (!ownerId) continue;

      // Solo el periodo en curso: una meta cumplida en 2025 no es noticia hoy.
      const { start, end } = this.customerGoals.getPeriodRange(
        goal.periodType,
        goal.periodValue,
      );
      if (now < start || now > end) continue;

      const progress = await this.customerGoals.getProgress(
        goal.customerId,
        goal.periodType,
        goal.periodValue,
      );
      if (progress.soldAmount < progress.targetAmount) continue;

      await this.notifications.emit({
        userIds: [ownerId],
        type: NotificationType.meta_cumplida,
        title: `${goal.customer.displayName} cumplió su meta ${goal.periodValue}`,
        body: `${progress.percentage}% del objetivo.`,
        entityType: "customer",
        entityId: goal.customerId,
        discriminator: goal.periodValue,
      });
    }
  }

  private async purgeRead(now: Date): Promise<void> {
    const cutoff = new Date(
      now.getTime() - READ_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );

    const result = await this.prisma.notification.deleteMany({
      where: { readAt: { not: null, lt: cutoff } },
    });

    this.logger.log(`Notificaciones leidas purgadas: ${result.count}`);
  }

  private formatDate(instant: Date): string {
    return instant.toLocaleDateString("es-CO", { timeZone: BOGOTA_TIME_ZONE });
  }
}
