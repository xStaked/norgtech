import { PrismaClient } from "@prisma/client";
import * as ExcelJS from "exceljs";
import { clean, parseTaxId } from "./import-customers";

/**
 * Carga la columna `Zona` del listado maestro de clientes, que el import
 * original nunca leyó (CustomerZone quedó vacía).
 *
 * Solo escribe en `Zone` y `CustomerZone`. **No toca `Customer`**: el vendedor
 * de la base es más nuevo que el del Excel (los archivos
 * "Clientes <VENDEDOR>.xlsx" son la actualización), así que reimportar la
 * columna Vendedor lo devolvería atrás.
 *
 * Un cliente puede tener varias zonas separadas por ";"
 * ("SANTANDER;BOGOTA;ANTIOQUIA;COSTA"), y CustomerZone es muchos-a-muchos.
 *
 * Las zonas se guardan tal como vienen (mayúsculas): son las que mandó el
 * cliente. Las que ya existen en el CRM (Sur america, Europa…) son regiones de
 * exportación, otra cosa, y no se tocan.
 *
 * Idempotente: upsert de Zone por nombre y de CustomerZone por
 * (customerId, zoneId).
 *
 *   pnpm --filter @norgtech/api exec tsx prisma/scripts/import-customer-zones.ts <ruta.xlsx> [--apply]
 */

type ZoneRow = { taxId: string; legalName: string; zones: string[] };

/** "SANTANDER;BOGOTA" -> ["SANTANDER", "BOGOTA"]; "ANTIOQUIA " -> ["ANTIOQUIA"] */
export function splitZones(raw: unknown): string[] {
  return clean(raw)
    .split(";")
    .map((z) => z.trim().toUpperCase())
    .filter(Boolean);
}

export function readZoneRows(wb: ExcelJS.Workbook): ZoneRow[] {
  const rows: ZoneRow[] = [];

  // NORGTECH: encabezados en la fila 3, zona en la columna 2.
  wb.getWorksheet("NORGTECH")?.eachRow((row, n) => {
    if (n < 4) return;
    const [, , zona, nombre, ident] = row.values as unknown[];
    const parsed = parseTaxId(ident);
    const legalName = clean(nombre);
    if (!legalName || !parsed) return;
    const zones = splitZones(zona);
    if (zones.length) rows.push({ taxId: parsed.taxId, legalName, zones });
  });

  // Nanonutrición: encabezado en la fila 1, identificación en la columna 7.
  const nano = wb.getWorksheet("Nanonutriciòn") ?? wb.getWorksheet("Nanonutrición");
  nano?.eachRow((row, n) => {
    if (n < 2) return;
    const [, , zona, nombre, , , , ident] = row.values as unknown[];
    const parsed = parseTaxId(ident);
    const legalName = clean(nombre);
    if (!legalName || !parsed) return;
    const zones = splitZones(zona);
    if (zones.length) rows.push({ taxId: parsed.taxId, legalName, zones });
  });

  return rows;
}

async function run(filePath: string, apply: boolean) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const rows = readZoneRows(wb);

  const prisma = new PrismaClient();
  const zoneNames = [...new Set(rows.flatMap((r) => r.zones))].sort();

  const existingZones = await prisma.zone.findMany({ select: { id: true, name: true } });
  const zoneIdByName = new Map(existingZones.map((z) => [z.name.toUpperCase(), z.id]));
  const created: string[] = [];

  for (const name of zoneNames) {
    if (zoneIdByName.has(name)) continue;
    created.push(name);
    if (apply) {
      const zone = await prisma.zone.create({ data: { name }, select: { id: true } });
      zoneIdByName.set(name, zone.id);
    }
  }

  let linked = 0;
  let already = 0;
  const missing: string[] = [];

  for (const row of rows) {
    const customer = await prisma.customer.findUnique({
      where: { taxId: row.taxId },
      select: { id: true },
    });
    if (!customer) {
      missing.push(`${row.legalName} (${row.taxId})`);
      continue;
    }

    for (const name of row.zones) {
      const zoneId = zoneIdByName.get(name);
      if (!zoneId) {
        // Solo pasa en dry-run: la zona aún no existe porque no se creó.
        linked++;
        continue;
      }
      const existing = await prisma.customerZone.findUnique({
        where: { customerId_zoneId: { customerId: customer.id, zoneId } },
        select: { id: true },
      });
      if (existing) {
        already++;
        continue;
      }
      linked++;
      if (apply) {
        await prisma.customerZone.create({ data: { customerId: customer.id, zoneId } });
      }
    }
  }

  await prisma.$disconnect();
  return { rows, zoneNames, created, linked, already, missing };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const filePath = args.find((a) => !a.startsWith("--"));
  if (!filePath) {
    console.error("Uso: tsx prisma/scripts/import-customer-zones.ts <ruta.xlsx> [--apply]");
    process.exit(1);
  }

  const { rows, zoneNames, created, linked, already, missing } = await run(filePath, apply);

  console.log(apply ? "\n═══ APLICADO ═══" : "\n═══ DRY-RUN (no escribe) ═══");
  console.log(`Clientes con zona en el Excel: ${rows.length}`);
  console.log(`Zonas distintas: ${zoneNames.length} → ${zoneNames.join(", ")}`);
  console.log(`Zonas ${apply ? "creadas" : "por crear"}: ${created.length}${created.length ? ` (${created.join(", ")})` : ""}`);
  console.log(`Asignaciones ${apply ? "creadas" : "por crear"}: ${linked}`);
  console.log(`Ya existían: ${already}`);
  console.log(`Del Excel no están en la base: ${missing.length}`);
  missing.slice(0, 5).forEach((m) => console.log(`   ${m}`));
  if (!apply) console.log(`\nPara aplicarlo: agrega --apply`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
