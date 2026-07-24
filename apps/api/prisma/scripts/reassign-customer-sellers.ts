import { PrismaClient } from "@prisma/client";
import * as ExcelJS from "exceljs";
import { clean, normalizeSeller, parseTaxId } from "./import-customers";

/**
 * Reasigna el vendedor de clientes ya existentes, desde los archivos de
 * actualización que manda el cliente ("Clientes <VENDEDOR>.xlsx").
 *
 * Manda la columna **Vendedor**, no el nombre del archivo: el archivo dice de
 * quién era la cartera y la columna a quién pasa. Las filas con Vendedor vacío
 * no se tocan — vacío significa "sin dato", no "quitarle el vendedor".
 *
 * Solo mueve `assignedToUserId`. No crea clientes, no los activa y no toca
 * ningún otro campo: para eso está import-customers.
 *
 * Escribe SOLO con --apply. Sin el flag es un dry-run, porque reasignar
 * cambia a quién se le comisiona.
 *
 *   pnpm --filter @norgtech/api exec tsx prisma/scripts/reassign-customer-sellers.ts <a.xlsx> [b.xlsx…] [--apply]
 */

type Planned = {
  taxId: string;
  legalName: string;
  file: string;
  from: string;
  to: string;
};

export type SheetRow = { taxId: string; legalName: string; seller: string | null };

/** Lee las filas de una hoja con el layout de estos archivos (encabezado fila 1). */
export function readSellerSheet(ws: ExcelJS.Worksheet): SheetRow[] {
  const rows: SheetRow[] = [];
  ws.eachRow((row, n) => {
    if (n < 2) return;
    const [, , , nombre, ident, , , vendedor] = row.values as unknown[];
    const legalName = clean(nombre);
    const parsed = parseTaxId(ident);
    if (!legalName || !parsed) return;
    rows.push({ taxId: parsed.taxId, legalName, seller: normalizeSeller(vendedor) });
  });
  return rows;
}

async function run(files: string[], apply: boolean) {
  const prisma = new PrismaClient();

  const users = await prisma.user.findMany({ select: { id: true, name: true, active: true } });
  const userByName = new Map(users.map((u) => [u.name.toUpperCase(), u]));

  const planned: Planned[] = [];
  const unchanged: string[] = [];
  const noSeller: string[] = [];
  const missing: string[] = [];
  const unknownSeller = new Set<string>();

  for (const file of files) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const label = file.split("/").pop() ?? file;

    for (const row of readSellerSheet(wb.worksheets[0])) {
      if (!row.seller) {
        noSeller.push(`${label}: ${row.legalName}`);
        continue;
      }

      const target = userByName.get(row.seller);
      if (!target) {
        unknownSeller.add(row.seller);
        continue;
      }

      const customer = await prisma.customer.findUnique({
        where: { taxId: row.taxId },
        select: { id: true, legalName: true, assignedToUser: { select: { id: true, name: true } } },
      });
      if (!customer) {
        missing.push(`${label}: ${row.legalName} (${row.taxId})`);
        continue;
      }

      if (customer.assignedToUser?.id === target.id) {
        unchanged.push(customer.legalName);
        continue;
      }

      planned.push({
        taxId: row.taxId,
        legalName: customer.legalName,
        file: label,
        from: customer.assignedToUser?.name ?? "(sin vendedor)",
        to: target.name,
      });

      if (apply) {
        await prisma.customer.update({
          where: { id: customer.id },
          data: { assignedToUserId: target.id },
        });
      }
    }
  }

  await prisma.$disconnect();
  return { planned, unchanged, noSeller, missing, unknownSeller: [...unknownSeller] };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const files = args.filter((a) => !a.startsWith("--"));
  if (files.length === 0) {
    console.error("Uso: tsx prisma/scripts/reassign-customer-sellers.ts <a.xlsx> [b.xlsx…] [--apply]");
    process.exit(1);
  }

  const { planned, unchanged, noSeller, missing, unknownSeller } = await run(files, apply);

  console.log(apply ? "\n═══ REASIGNADO ═══" : "\n═══ DRY-RUN (no escribe) ═══");

  const byMove = new Map<string, Planned[]>();
  planned.forEach((p) => {
    const key = `${p.from} → ${p.to}`;
    byMove.set(key, [...(byMove.get(key) ?? []), p]);
  });

  if (byMove.size === 0) {
    console.log("  Ningún cliente cambia de vendedor.");
  }
  for (const [move, list] of byMove) {
    console.log(`\n  ${move}   (${list.length} clientes)`);
    list.slice(0, 5).forEach((p) => console.log(`     ${p.legalName}`));
    if (list.length > 5) console.log(`     … y ${list.length - 5} más`);
  }

  console.log(`\nYa estaban con ese vendedor: ${unchanged.length}`);
  console.log(`Sin vendedor en el archivo (no se tocan): ${noSeller.length}`);
  console.log(`En el archivo pero no en la base: ${missing.length}`);
  missing.slice(0, 5).forEach((m) => console.log(`   ${m}`));
  if (unknownSeller.length) {
    console.log(`\n⚠ Vendedores del archivo que no existen como usuario: ${unknownSeller.join(", ")}`);
  }
  if (!apply && planned.length > 0) {
    console.log(`\nPara aplicarlo: agrega --apply`);
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
