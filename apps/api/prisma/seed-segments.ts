/**
 * Standalone, idempotent seed for customer segments.
 *
 * Production had an empty CustomerSegment table, which blocks creating any
 * customer (the create-customer flow requires a valid segmentId). The full
 * seed.ts also creates users/customers/etc, so this script seeds ONLY the
 * segments and is safe to run against production.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." npx ts-node prisma/seed-segments.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SEGMENTS = [
  { name: "Bronce", description: "Clientes nuevos o de bajo volumen", discountPercent: 3, minGoalAmount: 0, maxGoalAmount: 50000000 },
  { name: "Plata", description: "Clientes con buen potencial de crecimiento", discountPercent: 5, minGoalAmount: 50000000, maxGoalAmount: 150000000 },
  { name: "Oro", description: "Clientes estrategicos con alto volumen de compra", discountPercent: 8, minGoalAmount: 150000000, maxGoalAmount: 300000000 },
  { name: "Platino", description: "Clientes VIP con volumen excepcional", discountPercent: 12, minGoalAmount: 300000000, maxGoalAmount: null },
  { name: "Retail", description: "Cadenas de tiendas y distribuidores", discountPercent: 4, minGoalAmount: 0, maxGoalAmount: 100000000 },
  { name: "Industria", description: "Manufactura y sector industrial", discountPercent: 6, minGoalAmount: 100000000, maxGoalAmount: null },
];

async function main() {
  // createdBy/updatedBy are plain strings; use a real admin/director if present
  // so the audit fields point at a valid user, else fall back to "system".
  const auditor = await prisma.user.findFirst({
    where: { role: { in: ["administrador", "director_comercial"] }, active: true },
    select: { id: true },
  });
  const auditUserId = auditor?.id ?? "system";

  for (const seg of SEGMENTS) {
    await prisma.customerSegment.upsert({
      where: { name: seg.name },
      update: {
        description: seg.description,
        discountPercent: seg.discountPercent,
        minGoalAmount: seg.minGoalAmount,
        maxGoalAmount: seg.maxGoalAmount,
        active: true,
        updatedBy: auditUserId,
      },
      create: {
        name: seg.name,
        description: seg.description,
        discountPercent: seg.discountPercent,
        minGoalAmount: seg.minGoalAmount,
        maxGoalAmount: seg.maxGoalAmount,
        active: true,
        createdBy: auditUserId,
        updatedBy: auditUserId,
      },
    });
  }

  const count = await prisma.customerSegment.count();
  console.log(`✓ Segments seeded. CustomerSegment count: ${count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
