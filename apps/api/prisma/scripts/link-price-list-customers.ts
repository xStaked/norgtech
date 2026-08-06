import { PrismaClient } from "@prisma/client";

/**
 * Crea el cliente que le falta a una lista de precios de tipo `cliente` y los
 * engancha. Una lista `cliente` sin cliente es un estado inválido: la UI la
 * muestra como si fuera un comprador que no existe.
 *
 * Los datos vienen del Excel del catálogo, que solo trae el nombre. NIT,
 * contacto y dirección quedan vacíos a propósito: inventarlos ensuciaría la
 * base de 518 clientes reales y haría más difícil detectar el duplicado el día
 * que el cliente pase los datos buenos.
 *
 * Idempotente: reusa el cliente si ya existe por nombre.
 *
 *   pnpm --filter @norgtech/api exec tsx prisma/scripts/link-price-list-customers.ts [--dry]
 */

const PENDING_NOTE =
  "Creado desde LISTA DE PRECIOS 2026 para enganchar su lista. Datos (NIT, contacto, dirección) pendientes de confirmar con el cliente.";

async function run(dry: boolean) {
  const prisma = new PrismaClient();

  const orphans = await prisma.priceList.findMany({
    where: { kind: "cliente", customers: { none: {} } },
    select: { id: true, name: true, currency: true, country: true },
    orderBy: { name: "asc" },
  });

  const report: string[] = [];

  if (orphans.length === 0) {
    await prisma.$disconnect();
    return { report: ["No hay listas de cliente sin enganchar."], created: 0, linked: 0 };
  }

  const admin = await prisma.user.findFirst({
    where: { role: "administrador" },
    select: { id: true },
  });
  if (!admin) throw new Error("No hay usuario administrador para atribuir createdBy.");

  // El segmento es solo una etiqueta y estos facturan por Norgtech; sin más
  // información, Directo es el default menos sorprendente.
  const segment = await prisma.customerSegment.findFirst({
    where: { name: "Directo" },
    select: { id: true },
  });
  const company = await prisma.company.findFirst({
    where: { prefix: "NT" },
    select: { id: true },
  });
  if (!segment || !company) throw new Error("Falta el segmento Directo o la empresa Norgtech.");

  let created = 0;
  let linked = 0;

  for (const list of orphans) {
    const existing = await prisma.customer.findFirst({
      where: { displayName: list.name },
      select: { id: true },
    });

    if (dry) {
      report.push(`${list.name}: ${existing ? "engancharía el cliente existente" : "crearía cliente"} (${list.currency}, ${list.country ?? "sin país"})`);
      continue;
    }

    const customer =
      existing ??
      (await prisma.customer.create({
        data: {
          legalName: list.name,
          displayName: list.name,
          segmentId: segment.id,
          companyId: company.id,
          country: list.country,
          currency: list.currency,
          notes: PENDING_NOTE,
          createdBy: admin.id,
          updatedBy: admin.id,
        },
        select: { id: true },
      }));

    if (!existing) created += 1;

    await prisma.customer.update({
      where: { id: customer.id },
      data: { priceListId: list.id, country: list.country, currency: list.currency },
    });
    linked += 1;
    report.push(`${list.name}: ${existing ? "enganchado" : "creado y enganchado"} (${list.currency}, ${list.country ?? "sin país"})`);
  }

  // La moneda del cliente es la fuente de verdad; alinearla con la de su lista
  // evita cotizar en una moneda y facturar en otra.
  if (!dry) {
    await prisma.$executeRaw`
      UPDATE "Customer" c SET currency = l.currency, country = l.country
      FROM "PriceList" l
      WHERE c."priceListId" = l.id AND (c.currency <> l.currency OR c.country IS DISTINCT FROM l.country)`;
  }

  await prisma.$disconnect();
  return { report, created, linked };
}

async function main() {
  const dry = process.argv.includes("--dry");
  const { report, created, linked } = await run(dry);
  console.log(dry ? "\n═══ DRY-RUN (no escribe) ═══" : "\n═══ APLICADO ═══");
  report.forEach((line) => console.log("  ", line));
  if (!dry) console.log(`\nClientes creados: ${created} · listas enganchadas: ${linked}`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
