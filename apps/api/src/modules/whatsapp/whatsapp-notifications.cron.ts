import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { NotificationType } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { WhatsAppService } from "./whatsapp.service";

/**
 * Plantillas de Meta por tipo de notificacion. Un tipo que no este aqui NO se
 * empuja por WhatsApp: la campana de la app sigue siendo el canal por defecto y
 * WhatsApp queda para lo que hay que ver aunque no estes en el sistema.
 *
 * Los nombres deben existir y estar APROBADOS en Meta (ver
 * `docs/whatsapp-templates.md`); si no, Kapso rechaza el envio.
 */
const PUSH_TEMPLATES: Partial<Record<NotificationType, string>> = {
  [NotificationType.cliente_asignado]: "cliente_asignado",
  [NotificationType.visita_proxima]: "visita_proxima",
};

/**
 * Antiguedad maxima que se empuja. Si el cron estuvo caido un dia, avisar a las
 * 3am de una visita de ayer es peor que no avisar. Fuera de la ventana la
 * notificacion se marca como empujada sin enviar nada.
 */
const PUSH_MAX_AGE_MINUTES = 120;

/** Tope por corrida: un lote grande no debe monopolizar el proceso. */
const PUSH_BATCH_SIZE = 100;

/**
 * Vaciador del outbox de `Notification.pushedAt`.
 *
 * Vive en el modulo de WhatsApp y no en el de notificaciones para no cerrar el
 * ciclo de dependencias (WhatsApp ya importa NotificationsModule).
 *
 * REGLA DURA: solo escribe `pushedAt`. No crea notificaciones ni toca `readAt`:
 * que el aviso llegue por WhatsApp no significa que se haya leido.
 */
@Injectable()
export class WhatsAppNotificationsCron {
  private readonly logger = new Logger(WhatsAppNotificationsCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async runPush(): Promise<void> {
    await this.push(new Date());
  }

  /** `now` inyectado: los tests no dependen del reloj del proceso. */
  async push(now: Date): Promise<void> {
    const pending = await this.prisma.notification.findMany({
      where: {
        type: { in: Object.keys(PUSH_TEMPLATES) as NotificationType[] },
        pushedAt: null,
      },
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        createdAt: true,
        user: { select: { name: true, phone: true, active: true } },
      },
      orderBy: { createdAt: "asc" },
      take: PUSH_BATCH_SIZE,
    });

    const floor = new Date(now.getTime() - PUSH_MAX_AGE_MINUTES * 60 * 1000);

    for (const notification of pending) {
      // Marcar ANTES de llamar a Kapso: si el envio falla a medias, reintentar
      // cada 5 minutos duplicaria el mensaje en el telefono del comercial. El
      // aviso sigue en la campana, que es la fuente de verdad.
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: { pushedAt: now },
      });

      if (!notification.user.active || notification.createdAt < floor) {
        continue;
      }

      const template = PUSH_TEMPLATES[notification.type];
      if (!template) continue;

      const detalle = this.oneLine(
        [notification.title, notification.body].filter(Boolean).join(" — "),
      );

      try {
        await this.whatsapp.notifyUser(
          notification.user,
          template,
          [
            { name: "nombre", text: this.oneLine(notification.user.name ?? "") || "hola" },
            { name: "detalle", text: detalle },
          ],
          detalle,
        );
      } catch (error) {
        this.logger.warn(`Notificacion ${notification.id} no se pudo empujar: ${error}`);
      }
    }
  }

  /**
   * Meta rechaza parametros con saltos de linea o tabulaciones, y trunca los
   * muy largos. El titulo lo escribe el sistema, pero lleva dentro nombres de
   * cliente escritos por humanos.
   */
  private oneLine(text: string): string {
    return text.replace(/\s+/g, " ").trim().slice(0, 300);
  }
}
