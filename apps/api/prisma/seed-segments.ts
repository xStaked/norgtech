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

// El segmento es solo una etiqueta: espejo de Customer.customerType. Sin
// descuento ni meta — el negocio no los usa.
const SEGMENTS = [
  { name: "Distribuidor", description: "Etiqueta comercial. Sin descuento ni meta.", discountPercent: 0, minGoalAmount: 0, maxGoalAmount: null },
  { name: "Directo", description: "Etiqueta comercial. Sin descuento ni meta.", discountPercent: 0, minGoalAmount: 0, maxGoalAmount: null },
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
