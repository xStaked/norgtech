import { PrismaClient } from "@prisma/client";

type PrismaLike = Pick<PrismaClient, "order">;

export async function fixBillingCompanySnapshot(prisma: PrismaLike) {
  const orders = await prisma.order.findMany({
    include: { company: { select: { name: true } } },
  });

  let corrected = 0;
  for (const order of orders) {
    const companyName = order.company?.name;
    if (!companyName) continue;
    // Solo corrige donde el snapshot histórico quedó con el nombre del cliente
    // y difiere del nombre real de la empresa. Idempotente por construcción.
    if (
      order.billingCompanyNameSnapshot === order.customerNameSnapshot &&
      order.billingCompanyNameSnapshot !== companyName
    ) {
      await prisma.order.update({
        where: { id: order.id },
        data: { billingCompanyNameSnapshot: companyName },
      });
      corrected += 1;
    }
  }

  const result = { scanned: orders.length, corrected };
  console.log(
    `[fix-billing-company-snapshot] scanned=${result.scanned} corrected=${result.corrected}`,
  );
  return result;
}

// Ejecución directa: `npx ts-node prisma/scripts/fix-billing-company-snapshot.ts`
if (require.main === module) {
  const prisma = new PrismaClient();
  fixBillingCompanySnapshot(prisma)
    .then(() => prisma.$disconnect())
    .catch(async (err) => {
      console.error(err);
      await prisma.$disconnect();
      process.exit(1);
    });
}
