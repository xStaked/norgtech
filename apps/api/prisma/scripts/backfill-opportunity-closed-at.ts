import { OpportunityStage, PrismaClient } from "@prisma/client";

type PrismaLike = Pick<PrismaClient, "opportunity">;

/**
 * DASH-06: `Opportunity.closedAt` existia en el schema pero NO lo escribia
 * nadie (un grep en todo apps/api daba un unico hit: la lectura del dashboard).
 * Por eso todas las oportunidades historicas en `venta_cerrada` tienen
 * closedAt NULL y el contador "Ventas cerradas 30d", que filtra
 * `closedAt >= T-30d`, nunca las cuenta.
 *
 * APROXIMACION DELIBERADA: se usa `updatedAt` como fecha de cierre. NO es la
 * fecha real del cierre: `updatedAt` se mueve con CUALQUIER edicion posterior
 * de la fila, asi que una oportunidad cerrada en enero y editada en junio
 * quedara fechada en junio. Es la mejor senal disponible sin un historial de
 * transiciones (el AuditLog guarda `opportunity.stage_changed`, pero no se usa
 * aqui para no acoplar el backfill a la forma del payload de auditoria).
 * Las oportunidades cerradas a partir de este cambio llevan la fecha correcta,
 * sellada en la transicion.
 *
 * Idempotente por construccion: solo toca filas en `venta_cerrada` con
 * `closedAt: null`, asi que re-ejecutarlo no pisa fechas ya selladas por el
 * servicio ni correcciones manuales.
 */
export async function backfillOpportunityClosedAt(prisma: PrismaLike) {
  const opportunities = await prisma.opportunity.findMany({
    where: { stage: OpportunityStage.venta_cerrada, closedAt: null },
    select: { id: true, updatedAt: true },
  });

  let updated = 0;

  for (const opportunity of opportunities) {
    await prisma.opportunity.update({
      where: { id: opportunity.id },
      data: { closedAt: opportunity.updatedAt },
    });
    updated += 1;
  }

  const result = { scanned: opportunities.length, updated };
  console.log(
    `[backfill-opportunity-closed-at] scanned=${result.scanned} updated=${result.updated} (closedAt=updatedAt, aproximacion: updatedAt se mueve con cualquier edicion)`,
  );
  return result;
}

// Ejecucion directa: `npx ts-node prisma/scripts/backfill-opportunity-closed-at.ts`
if (require.main === module) {
  const prisma = new PrismaClient();
  backfillOpportunityClosedAt(prisma)
    .then(() => prisma.$disconnect())
    .catch(async (err) => {
      console.error(err);
      await prisma.$disconnect();
      process.exit(1);
    });
}
