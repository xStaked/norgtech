import { PrismaClient } from "@prisma/client";
import { isEligibleSeller } from "../../src/modules/seller-goals/seller-eligibility";

type PrismaLike = Pick<PrismaClient, "order" | "user">;

/**
 * GOAL-02: los pedidos historicos se crearon antes de que Order.sellerUserId
 * existiera, por lo que todos quedaron en NULL y no se atribuyen a ninguna
 * meta. Este backfill resuelve el vendedor con la misma precedencia que
 * `OrdersService.create`:
 *
 *   1. customer.assignedToUserId
 *   2. createdBy, solo si ese usuario es un vendedor elegible (rol comercial /
 *      director_comercial Y activo)
 *   3. NULL -> queda sin vendedor y se reporta como `unresolved`
 *
 * Idempotente por construccion: solo toca pedidos con sellerUserId IS NULL, asi
 * que re-ejecutarlo no pisa atribuciones ya resueltas ni correcciones manuales.
 */
export async function backfillOrderSeller(prisma: PrismaLike) {
  const orders = await prisma.order.findMany({
    where: { sellerUserId: null },
    select: {
      id: true,
      createdBy: true,
      customer: { select: { assignedToUserId: true } },
    },
  });

  // Los creadores se resuelven en un solo query en vez de uno por pedido.
  const creatorIds = [...new Set(orders.map((order) => order.createdBy))];
  const creators = creatorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: creatorIds } },
        select: { id: true, role: true, active: true },
      })
    : [];
  const creatorsById = new Map(creators.map((user) => [user.id, user]));

  let updated = 0;
  let unresolved = 0;

  for (const order of orders) {
    const creator = creatorsById.get(order.createdBy);
    const sellerUserId =
      order.customer?.assignedToUserId ??
      (isEligibleSeller(creator) ? order.createdBy : null);

    if (!sellerUserId) {
      // Sin vendedor determinable: se deja en NULL a proposito. Se reporta en
      // vez de silenciarse; requiere atribucion manual.
      unresolved += 1;
      continue;
    }

    await prisma.order.update({
      where: { id: order.id },
      data: { sellerUserId },
    });
    updated += 1;
  }

  const result = { scanned: orders.length, updated, unresolved };
  console.log(
    `[backfill-order-seller] scanned=${result.scanned} updated=${result.updated} unresolved=${result.unresolved}`,
  );
  return result;
}

// Ejecucion directa: `npx ts-node prisma/scripts/backfill-order-seller.ts`
if (require.main === module) {
  const prisma = new PrismaClient();
  backfillOrderSeller(prisma)
    .then(() => prisma.$disconnect())
    .catch(async (err) => {
      console.error(err);
      await prisma.$disconnect();
      process.exit(1);
    });
}
