import { PrismaClient, CustomerType, PaymentCondition } from "@prisma/client";
import * as ExcelJS from "exceljs";
import { clean, isActive, parseCustomerType, parsePayment, parseTaxId } from "./import-customers";

/**
 * Aplica las actualizaciones de los archivos "CLIENTES <VENDEDOR>.xlsx" sobre
 * clientes que ya existen: estado, tipo, condición de pago y zona.
 *
 * El vendedor NO se toca aquí — para eso está reassign-customer-sellers.ts.
 * Tampoco se crean clientes: el que no esté en la base se reporta y se salta.
 *
 * **Solo se escribe la fila que trae `Tipo`.** Tipo vacío es "sin dato" en
 * estos archivos (el cliente lo deja en blanco cuando ya no le compra), así que
 * nunca desactiva ni pisa la condición de pago de nadie. La zona sí se carga
 * aunque la fila no traiga Tipo: es metadato y no cambia nada comercial.
 *
 * Escribe SOLO con --apply.
 *
 *   pnpm --filter @norgtech/api exec tsx prisma/scripts/update-customers-from-sheet.ts <a.xlsx> [--apply]
 */

// Las zonas se escriben a mano y llegan con errores de dedo. Se corrigen para
// no crear una zona nueva por cada typo.
const ZONE_FIXES: Record<string, string> = {
  "SADANA DE TORRES": "SABANA DE TORRES",
  BGOOTA: "BOGOTA",
};

export type Row = {
  legalName: string;
  taxId: string;
  /** El Tipo del Excel: vacio = fila sin dato, que no se escribe. */
  active: boolean;
  customerType: CustomerType;
  paymentCondition: PaymentCondition;
  paymentDays: number;
  zones: string[];
};

/** Un cliente puede tener varias zonas, separadas por "/" o ";". */
export function splitZones(raw: unknown): string[] {
  return clean(raw)
    .toUpperCase()
    .split(/[;/]/)
    .map((z) => z.trim())
    .filter(Boolean)
    .map((z) => ZONE_FIXES[z] ?? z);
}

/** Layout de estos archivos: encabezado en la fila 1. */
export function readSheet(ws: ExcelJS.Worksheet): Row[] {
  const rows: Row[] = [];
  ws.eachRow((row, n) => {
    if (n < 2) return;
    const [, tipo, zona, nombre, ident, , , , dias] = row.values as unknown[];
    const legalName = clean(nombre);
    const parsed = parseTaxId(ident);
    if (!legalName || !parsed) return;
    rows.push({
      legalName,
      taxId: parsed.taxId,
      active: isActive(tipo),
      customerType: parseCustomerType(tipo),
      ...parsePayment(dias),
      zones: splitZones(zona),
    });
  });
  return rows;
}

async function run(files: string[], apply: boolean) {
  const prisma = new PrismaClient();

  const zones = await prisma.zone.findMany({ select: { id: true, name: true } });
  const zoneIdByName = new Map(zones.map((z) => [z.name.toUpperCase(), z.id]));

  const changes: string[] = [];
  const zoneLinks: string[] = [];
  const zonesCreated: string[] = [];
  const missing: string[] = [];
  let unchanged = 0;
  let untouched = 0;

  for (const file of files) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);

    for (const row of readSheet(wb.worksheets[0])) {
      const customer = await prisma.customer.findUnique({
        where: { taxId: row.taxId },
        select: {
          id: true,
          legalName: true,
          active: true,
          customerType: true,
          paymentCondition: true,
          paymentDays: true,
        },
      });
      if (!customer) {
        missing.push(`${row.legalName} (${row.taxId})`);
        continue;
      }

      if (!row.active) {
        untouched++;
      } else {
        const data: Record<string, unknown> = {};
        const diff: string[] = [];
        if (customer.active !== row.active) {
          data.active = row.active;
          diff.push(row.active ? "activo" : "inactivo");
        }
        if (customer.customerType !== row.customerType) {
          data.customerType = row.customerType;
          diff.push(`tipo ${customer.customerType}→${row.customerType}`);
        }
        if (
          customer.paymentCondition !== row.paymentCondition ||
          customer.paymentDays !== row.paymentDays
        ) {
          data.paymentCondition = row.paymentCondition;
          data.paymentDays = row.paymentDays;
          diff.push(`pago ${customer.paymentCondition}→${row.paymentCondition}`);
        }

        if (diff.length === 0) {
          unchanged++;
        } else {
          changes.push(`${customer.legalName}: ${diff.join(", ")}`);
          if (apply) await prisma.customer.update({ where: { id: customer.id }, data });
        }
      }

      for (const name of row.zones) {
        let zoneId = zoneIdByName.get(name);
        if (!zoneId) {
          zonesCreated.push(name);
          if (!apply) continue; // En dry-run no hay id contra el cual chequear.
          zoneId = (await prisma.zone.create({ data: { name }, select: { id: true } })).id;
          zoneIdByName.set(name, zoneId);
        }
        const link = await prisma.customerZone.findUnique({
          where: { customerId_zoneId: { customerId: customer.id, zoneId } },
          select: { id: true },
        });
        if (link) continue;
        zoneLinks.push(`${customer.legalName} → ${name}`);
        if (apply) await prisma.customerZone.create({ data: { customerId: customer.id, zoneId } });
      }
    }
  }

  await prisma.$disconnect();
  return { changes, zoneLinks, zonesCreated: [...new Set(zonesCreated)], missing, unchanged, untouched };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const files = args.filter((a) => !a.startsWith("--"));
  if (files.length === 0) {
    console.error("Uso: tsx prisma/scripts/update-customers-from-sheet.ts <a.xlsx> [--apply]");
    process.exit(1);
  }

  const r = await run(files, apply);

  console.log(apply ? "\n═══ APLICADO ═══" : "\n═══ DRY-RUN (no escribe) ═══");
  console.log(`\nClientes con cambios: ${r.changes.length}`);
  r.changes.forEach((c) => console.log(`   ${c}`));
  console.log(`\nZonas ${apply ? "creadas" : "por crear"}: ${r.zonesCreated.join(", ") || "ninguna"}`);
  console.log(`Asignaciones de zona ${apply ? "creadas" : "por crear"}: ${r.zoneLinks.length}`);
  console.log(`\nYa estaban igual: ${r.unchanged}`);
  console.log(`Sin Tipo en el archivo (no se tocan): ${r.untouched}`);
  console.log(`En el archivo pero no en la base: ${r.missing.length}`);
  r.missing.slice(0, 5).forEach((m) => console.log(`   ${m}`));
  if (!apply) console.log(`\nPara aplicarlo: agrega --apply`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
