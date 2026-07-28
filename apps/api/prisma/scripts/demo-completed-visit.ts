/**
 * Dato de demo: deja UNA visita en estado `completada` con resumen.
 *
 * Por que existe: el modulo de reportes solo sabe generar reportes a partir de
 * una visita completada Y con summary (reports.service.ts:60 y :65). Hoy la
 * base tiene visitas programadas y ninguna completada, asi que la pantalla de
 * reportes esta legitimamente vacia y no hay forma de generar ni uno.
 *
 * NO crea el ExecutiveReport a proposito: se genera desde la UI o desde Nora
 * con el endpoint real (POST /reports/from-visit/:visitId). Asi la demo muestra
 * el flujo de verdad y este script no duplica la logica del payload, que si
 * cambia en el service quedaria desincronizada aca.
 *
 * Es idempotente: si la visita ya esta completada, no la vuelve a tocar.
 *
 * Uso:
 *   DATABASE_URL="postgresql://..." npx ts-node prisma/scripts/demo-completed-visit.ts
 *
 * Para deshacerlo, el id de la visita queda impreso al final.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const RESUMEN =
  "Visita de seguimiento. Se reviso el consumo del ultimo trimestre y la " +
  "rotacion de producto en bodega. El cliente reporta buena aceptacion de la " +
  "linea y pregunta por disponibilidad para aumentar el pedido mensual.";

const NOTAS =
  "Atendio el jefe de compras. Pidio cotizacion formal antes de fin de mes.";

const PROXIMO_PASO = "Enviar cotizacion actualizada y agendar visita de cierre.";

async function main() {
  // La mas reciente que no este cancelada: es la que el equipo reconoce.
  const visit = await prisma.visit.findFirst({
    where: { status: { not: "cancelada" } },
    orderBy: { scheduledAt: "desc" },
    include: { customer: { select: { displayName: true } } },
  });

  if (!visit) {
    console.error(
      "No hay ninguna visita en la base. Crea una desde el portal o por WhatsApp y volve a correr esto.",
    );
    process.exitCode = 1;
    return;
  }

  if (visit.status === "completada" && visit.summary) {
    console.log(
      `La visita ${visit.id} (${visit.customer.displayName}) ya esta completada con resumen. Nada que hacer.`,
    );
    console.log(`Genera el reporte con: POST /reports/from-visit/${visit.id}`);
    return;
  }

  const updated = await prisma.visit.update({
    where: { id: visit.id },
    data: {
      status: "completada",
      // Si ya tenia fecha de completado se respeta; si no, la de agenda.
      completedAt: visit.completedAt ?? visit.scheduledAt,
      summary: visit.summary ?? RESUMEN,
      notes: visit.notes ?? NOTAS,
      nextStep: visit.nextStep ?? PROXIMO_PASO,
    },
  });

  console.log(`Visita completada: ${updated.id} (${visit.customer.displayName})`);
  console.log(`Ahora si se puede generar el reporte: POST /reports/from-visit/${updated.id}`);
  console.log(`Para revertir: status -> "${visit.status}", completedAt -> ${visit.completedAt}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
