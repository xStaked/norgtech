import { PrismaClient, CustomerType, PaymentCondition } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import * as ExcelJS from "exceljs";

/**
 * Importa el listado de clientes que entrego Norgtech (2 hojas: NORGTECH y
 * Nanonutricion) a la tabla Customer.
 *
 * Idempotente: upsert por taxId normalizado, asi que re-ejecutarlo contra otra
 * base (produccion) o repetirlo tras corregir el Excel no duplica nada. Los
 * campos que el Excel no trae nunca se pisan con null.
 *
 *   pnpm --filter @norgtech/api exec ts-node prisma/scripts/import-customers.ts <ruta.xlsx>
 */

const DEFAULT_SEGMENT = "Bronce";
const TEST_CUSTOMERS = ["Cliente Prueba SAS", "Cliente Billing SAS"];

// Los vendedores vienen escritos a mano, con espacios y dos formas para la
// misma persona. Se normalizan a un solo nombre canonico por humano.
const SELLER_ALIASES: Record<string, string> = {
  BREYNER: "BREYNER VALLE",
};

// Cada hoja del Excel es una razon social distinta. Se resuelve por prefijo y no
// por id para que el script sirva en cualquier base.
export const COMPANY_PREFIX_BY_SHEET = {
  NORGTECH: "NT",
  NANONUTRICION: "NN",
} as const;

type Row = {
  legalName: string;
  taxId: string;
  customerType: CustomerType;
  active: boolean;
  paymentCondition: PaymentCondition;
  paymentDays: number;
  seller: string | null;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  notes: string;
  companyPrefix: string;
};

/** Las celdas de correo llegan como hyperlink ({text, hyperlink}) y las de
 *  formula como {result}, no como string. */
export const clean = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    const cell = v as { text?: unknown; result?: unknown };
    return clean(cell.text ?? cell.result ?? "");
  }
  return String(v).trim().replace(/\s+/g, " ");
};

/** Digito de verificacion DIAN. Solo se usa para reportar cuales no cuadran:
 *  el listado se sube tal cual lo entrego el cliente, y corregir el NIT es
 *  decision de ellos, no del import. */
export function nitCheckDigit(nit: string): number {
  const weights = [71, 67, 59, 53, 47, 43, 41, 37, 29, 23, 19, 17, 13, 7, 3];
  const digits = [...nit].map(Number);
  const used = weights.slice(-digits.length);
  const sum = digits.reduce((acc, d, i) => acc + d * used[i], 0);
  const rest = sum % 11;
  return rest >= 2 ? 11 - rest : rest;
}

/**
 * "NIT 900561013 7" -> "900561013-7"
 * "CC 915108090"    -> "915108090"
 *
 * La clave es el NIT completo tal como viene, DV incluido. Eso hace que dos
 * filas del mismo NIT con DV distinto entren como dos clientes: es a proposito,
 * el listado se sube igual al que entrego el cliente y depurarlo es de ellos.
 */
export function parseTaxId(
  raw: unknown,
): { key: string; taxId: string; base: string; sheetDv?: string } | null {
  const value = clean(raw).toUpperCase();
  if (!value) return null;
  // Quita el prefijo de tipo de documento (NIT, CC, CE, TI, PP, OTRO, o la
  // frase completa "DOCUMENTO DE IDENTIFICACION EXTRANJERO").
  const body = value.replace(/^(NIT|CC|CE|TI|PP|OTRO|DOCUMENTO DE IDENTIFICACI[OÓ]N EXTRANJERO)\s+/, "");
  const parts = body.split(/[\s-]+/).filter(Boolean);
  if (!parts.length) return null;
  const base = parts[0].replace(/[^A-Z0-9]/g, "");
  if (!base) return null;
  const sheetDv = parts[1] && /^\d$/.test(parts[1]) ? parts[1] : undefined;
  const taxId = sheetDv === undefined ? base : `${base}-${sheetDv}`;
  return { key: taxId, taxId, base, sheetDv };
}

/** La columna Tipo vacia significa que el cliente compro en algun momento pero
 *  hoy no: el cliente confirmo que esos son inactivos. */
export function isActive(rawTipo: unknown): boolean {
  return clean(rawTipo) !== "";
}

export function parseCustomerType(raw: unknown): CustomerType {
  // "DISTRIBUIDOR;DIRECTO" cuenta como distribuidor: es la relacion comercial
  // que manda para precios y credito.
  return clean(raw).toUpperCase().includes("DISTRIBUIDOR")
    ? CustomerType.distribuidor
    : CustomerType.cliente_directo;
}

export function parsePayment(raw: unknown): { paymentCondition: PaymentCondition; paymentDays: number } {
  const value = clean(raw).toLowerCase();
  const days = Number(value);
  if (Number.isFinite(days) && days > 0) {
    const bucket = [15, 30, 60, 90].find((d) => d === days);
    if (bucket) {
      return {
        paymentCondition: PaymentCondition[`credito_${bucket}` as keyof typeof PaymentCondition],
        paymentDays: bucket,
      };
    }
  }
  // Vacio o "contado" -> contado. Es el default del schema y el supuesto
  // conservador: sin cupo de credito hasta que alguien lo configure.
  return { paymentCondition: PaymentCondition.contado, paymentDays: 0 };
}

export function normalizeSeller(raw: unknown): string | null {
  const name = clean(raw).toUpperCase();
  if (!name) return null;
  return SELLER_ALIASES[name] ?? name;
}

function readSheets(wb: ExcelJS.Workbook): { rows: Row[]; skipped: string[]; dvFixed: string[] } {
  const byKey = new Map<string, Row>();
  const skipped: string[] = [];
  const dvFixed: string[] = [];

  // No corrige nada: solo deja constancia para que el cliente lo revise.
  const checkDv = (parsed: { base: string; sheetDv?: string }, name: string) => {
    if (!parsed.sheetDv || !/^\d+$/.test(parsed.base)) return;
    const expected = nitCheckDigit(parsed.base);
    if (String(expected) !== parsed.sheetDv) {
      dvFixed.push(`${name} (${parsed.base}-${parsed.sheetDv}): el DV que calcula la DIAN es ${expected}`);
    }
  };

  const norgtech = wb.getWorksheet("NORGTECH");
  norgtech?.eachRow((row, n) => {
    if (n < 4) return; // 1-2 titulo, 3 encabezados
    const [, tipo, , nombre, ident, props, anio, vendedor, dias] = row.values as unknown[];
    const legalName = clean(nombre);
    const parsed = parseTaxId(ident);
    if (!legalName || !parsed) {
      skipped.push(`NORGTECH fila ${n}: nombre="${legalName}" ident="${clean(ident)}"`);
      return;
    }
    checkDv(parsed, legalName);
    byKey.set(parsed.key, {
      legalName,
      taxId: parsed.taxId,
      customerType: parseCustomerType(tipo),
      active: isActive(tipo),
      ...parsePayment(dias),
      seller: normalizeSeller(vendedor),
      notes: `Importado del listado del cliente (hoja NORGTECH). Año: ${clean(anio) || "no registra"}. Propiedades: ${clean(props) || "no registra"}.`,
      companyPrefix: COMPANY_PREFIX_BY_SHEET.NORGTECH,
    });
  });

  const nano = wb.getWorksheet("Nanonutriciòn") ?? wb.getWorksheet("Nanonutrición");
  nano?.eachRow((row, n) => {
    if (n < 2) return;
    const [, tipo, , nombre, tercero, estado, , ident, direccion, ciudad, telefono, correo, vendedor, dias] =
      row.values as unknown[];
    const legalName = clean(nombre);
    const parsed = parseTaxId(ident);
    if (!legalName || !parsed) {
      skipped.push(`Nanonutricion fila ${n}: nombre="${legalName}" ident="${clean(ident)}"`);
      return;
    }
    checkDv(parsed, legalName);
    byKey.set(parsed.key, {
      legalName,
      taxId: parsed.taxId,
      customerType: parseCustomerType(tipo),
      active: isActive(tipo),
      ...parsePayment(dias),
      seller: normalizeSeller(vendedor),
      phone: clean(telefono) || undefined,
      email: clean(correo) || undefined,
      address: clean(direccion) || undefined,
      city: clean(ciudad) || undefined,
      notes: `Importado del listado del cliente (hoja Nanonutrición). Tercero: ${clean(tercero) || "no registra"}. Estado: ${clean(estado) || "no registra"}.`,
      companyPrefix: COMPANY_PREFIX_BY_SHEET.NANONUTRICION,
    });
  });

  return { rows: [...byKey.values()], skipped, dvFixed };
}

/** Crea los vendedores del Excel que aun no existen como User. */
async function resolveSellers(prisma: PrismaClient, names: string[]) {
  const users = await prisma.user.findMany({ select: { id: true, name: true } });
  const byName = new Map<string, string>();
  for (const u of users) {
    const norm = u.name.trim().toUpperCase();
    byName.set(norm, u.id);
    // "sebastian" en la DB tiene que casar con "SEBASTIAN" del Excel, y
    // "ALVARO GONZALEZ" con un eventual "Alvaro" ya existente.
    const first = norm.split(" ")[0];
    if (!byName.has(first)) byName.set(first, u.id);
  }

  // Hash de un secreto aleatorio: entran activos (para que cuenten como
  // vendedor elegible en la atribucion de metas) pero sin password conocido,
  // asi que no pueden iniciar sesion hasta que alguien les asigne una.
  const lockedHash = await bcrypt.hash(`import-${Date.now()}-${Math.random()}`, 10);
  const created: string[] = [];

  for (const name of names) {
    if (byName.has(name)) continue;
    const email = `${name.toLowerCase().split(" ")[0]}@norgtech.com`;
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    const user =
      existing ??
      (await prisma.user.create({
        data: { name, email, passwordHash: lockedHash, role: "comercial", active: true },
        select: { id: true },
      }));
    if (!existing) created.push(`${name} <${email}>`);
    byName.set(name, user.id);
  }

  return { byName, created };
}

async function deleteTestCustomers(prisma: PrismaClient) {
  const deleted: string[] = [];
  const blocked: string[] = [];
  const targets = await prisma.customer.findMany({
    where: { legalName: { in: TEST_CUSTOMERS } },
    select: { id: true, legalName: true },
  });
  for (const c of targets) {
    try {
      await prisma.customer.delete({ where: { id: c.id } });
      deleted.push(c.legalName);
    } catch {
      // Tiene pedidos/cotizaciones colgando: se deja intacto a proposito.
      blocked.push(`${c.legalName} (${c.id})`);
    }
  }
  return { deleted, blocked };
}

export async function importCustomers(prisma: PrismaClient, filePath: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const { rows, skipped, dvFixed } = readSheets(wb);

  const segment = await prisma.customerSegment.findUnique({ where: { name: DEFAULT_SEGMENT } });
  if (!segment) throw new Error(`Falta el segmento "${DEFAULT_SEGMENT}"; corre db:seed primero.`);

  const companies = await prisma.company.findMany({
    where: { prefix: { in: Object.values(COMPANY_PREFIX_BY_SHEET) } },
    select: { id: true, prefix: true },
  });
  const companyIdByPrefix = new Map(companies.map((c) => [c.prefix, c.id]));

  for (const prefix of Object.values(COMPANY_PREFIX_BY_SHEET)) {
    if (!companyIdByPrefix.has(prefix)) {
      throw new Error(`Falta la empresa con prefijo "${prefix}"; corre las migraciones primero.`);
    }
  }

  const admin = await prisma.user.findFirst({ where: { role: "administrador" }, select: { id: true } });
  if (!admin) throw new Error("No hay usuario administrador para atribuir createdBy.");

  const cleanup = await deleteTestCustomers(prisma);

  const sellerNames = [...new Set(rows.map((r) => r.seller).filter((s): s is string => !!s))].sort();
  const { byName, created } = await resolveSellers(prisma, sellerNames);

  let inserted = 0;
  let updated = 0;
  for (const row of rows) {
    const data = {
      legalName: row.legalName,
      displayName: row.legalName,
      customerType: row.customerType,
      active: row.active,
      paymentCondition: row.paymentCondition,
      paymentDays: row.paymentDays,
      assignedToUserId: row.seller ? (byName.get(row.seller) ?? null) : null,
      phone: row.phone,
      email: row.email,
      address: row.address,
      city: row.city,
      notes: row.notes,
      updatedBy: admin.id,
    };
    const existing = await prisma.customer.findUnique({ where: { taxId: row.taxId }, select: { id: true } });
    if (existing) {
      await prisma.customer.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await prisma.customer.create({
        data: {
          ...data,
          taxId: row.taxId,
          segmentId: segment.id,
          createdBy: admin.id,
          companyId: companyIdByPrefix.get(row.companyPrefix)!,
        },
      });
      inserted++;
    }
  }

  return {
    inserted,
    updated,
    skipped,
    dvFixed,
    sellersCreated: created,
    cleanup,
    total: rows.length,
    inactive: rows.filter((r) => !r.active).length,
  };
}

if (require.main === module) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Uso: ts-node prisma/scripts/import-customers.ts <ruta-al-xlsx>");
    process.exit(1);
  }
  const prisma = new PrismaClient();
  importCustomers(prisma, filePath)
    .then((r) => {
      console.log(`\nFilas utiles en el Excel: ${r.total}`);
      console.log(`Clientes creados:   ${r.inserted}`);
      console.log(`Clientes actualizados: ${r.updated}`);
      console.log(`  de esos, inactivos (sin Tipo en el Excel): ${r.inactive}`);
      console.log(`Clientes de prueba borrados: ${r.cleanup.deleted.length}`);
      if (r.cleanup.blocked.length) console.log(`  no borrables (tienen datos): ${r.cleanup.blocked.join(", ")}`);
      if (r.sellersCreated.length) {
        console.log(`\nVendedores creados (activos, email placeholder y sin password - hay que corregirlos):`);
        r.sellersCreated.forEach((s) => console.log(`  - ${s}`));
      }
      if (r.dvFixed.length) {
        console.log(`\nNITs con DV que no cuadra (${r.dvFixed.length}) - se subieron TAL CUAL, avisar al cliente:`);
        r.dvFixed.forEach((s) => console.log(`  - ${s}`));
      }
      if (r.skipped.length) {
        console.log(`\nFilas saltadas (${r.skipped.length}):`);
        r.skipped.forEach((s) => console.log(`  - ${s}`));
      }
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
