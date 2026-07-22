import { Injectable, NotFoundException } from "@nestjs/common";
import { NotificationType, Prisma, UserRole } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * Escritor aceptado por `emit`. Igual que `AuditService.record`, admite el
 * cliente de transaccion para que la notificacion viva dentro de la misma
 * transaccion que el cambio que la origina: si el update falla, no queda
 * notificacion fantasma.
 */
export type NotificationWriter =
  | Pick<PrismaService, "notification" | "user">
  | Prisma.TransactionClient;

export interface EmitInput {
  userIds: string[];
  type: NotificationType;
  title: string;
  body?: string;
  entityType: string;
  entityId: string;
  /**
   * Parte final del `dedupeKey`. Sirve para que varios eventos de la misma
   * entidad convivan: el estado en `pedido_hito`, el periodo en
   * `meta_cumplida`. Sin discriminante hay UNA notificacion por entidad, que
   * es lo que se quiere en los vencidos (no una por dia vencido).
   */
  discriminator?: string;
}

/** Roles que reciben copia de los tipos supervisados. */
const SUPERVISOR_ROLES: UserRole[] = [
  UserRole.administrador,
  UserRole.director_comercial,
];

/**
 * Tipos que ademas del dueno notifican a los supervisores.
 *
 * Solo `meta_cumplida`: es el unico que es noticia hacia arriba. En los demas
 * el supervisor o ya lo sabe (el asigno el cliente, el resolvio el gasto) o ya
 * lo tiene en el dashboard (los vencidos). Copiar todo les llena la campana de
 * ruido y dejan de mirarla.
 */
export const SUPERVISED_TYPES: NotificationType[] = [
  NotificationType.meta_cumplida,
];

export function dedupeKeyFor(
  userId: string,
  type: NotificationType,
  entityId: string,
  discriminator?: string,
): string {
  return [userId, type, entityId, discriminator ?? ""].join(":");
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async emit(
    input: EmitInput,
    writer: NotificationWriter = this.prisma,
  ): Promise<{ count: number }> {
    const recipients = await this.resolveRecipients(input, writer);
    if (recipients.length === 0) {
      return { count: 0 };
    }

    return writer.notification.createMany({
      data: recipients.map((userId) => ({
        userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        entityType: input.entityType,
        entityId: input.entityId,
        dedupeKey: dedupeKeyFor(
          userId,
          input.type,
          input.entityId,
          input.discriminator,
        ),
      })),
      skipDuplicates: true,
    });
  }

  list(userId: string, opts: { unread?: boolean; limit?: number } = {}) {
    return this.prisma.notification.findMany({
      where: {
        userId,
        ...(opts.unread ? { readAt: null } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: opts.limit ?? 20,
    });
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({
      where: { userId, readAt: null },
    });
    return { count };
  }

  /**
   * 404 y no 403 cuando la fila es de otro: responder 403 confirmaria que
   * existe una notificacion ajena con ese id.
   */
  async markRead(userId: string, id: string): Promise<{ ok: true }> {
    const result = await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });

    if (result.count === 0) {
      throw new NotFoundException("Notification not found");
    }

    return { ok: true };
  }

  markAllRead(userId: string): Promise<{ count: number }> {
    return this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  private async resolveRecipients(
    input: EmitInput,
    writer: NotificationWriter,
  ): Promise<string[]> {
    const owners = input.userIds.filter((id): id is string => Boolean(id));
    if (owners.length === 0) {
      return [];
    }

    if (!SUPERVISED_TYPES.includes(input.type)) {
      return [...new Set(owners)];
    }

    const supervisors = await writer.user.findMany({
      where: { role: { in: SUPERVISOR_ROLES }, active: true },
      select: { id: true },
    });

    return [...new Set([...owners, ...supervisors.map((u) => u.id)])];
  }
}
