import { PrismaClient, PriceListKind } from "@prisma/client";
import * as ExcelJS from "exceljs";

/**
 * Importa el catálogo real (productos + presentaciones + precios por lista)
 * desde "LISTA DE PRECIOS 2026.xlsx". Cada hoja = una PriceList.
 *
 * Los precios se suben TAL CUAL el cliente los mandó (sin/con IVA como vienen,
 * sin derivar ni corregir). IVA observado: 0% (exento) o 5%, nunca 19%.
 *
 * Idempotente: upsert por Product.sku, ProductPresentation(productId,empaque),
 * PriceList.name y PriceListItem(priceListId,presentationId).
 *
 *   pnpm --filter @norgtech/api exec tsx prisma/scripts/import-catalog.ts <ruta.xlsx> [--dry]
 */

export const clean = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    const c = v as { text?: unknown; result?: unknown };
    return clean(c.text ?? c.result ?? "");
  }
  return String(v).trim().replace(/\s+/g, " ");
};

export const num = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v && typeof v === "object" && typeof (v as any).result === "number")
    return (v as any).result;
  return null;
};

/** Clave de dedup: colapsa "ASATECH" vs "ASA TECH" al mismo producto. */
export const prodKey = (name: string) => name.toUpperCase().replace(/\s+/g, "");

/** SKU determinista y único-por-nombre (idempotente entre corridas). */
export const skuFromName = (name: string) =>
  "CAT-" +
  name
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 40);

/** IVA que trae la fila: (con/sin − 1). Redondeado, null si falta un lado. */
export const deriveTaxPercent = (
  sin: number | null,
  con: number | null,
): number | null => {
  if (!sin || con === null) return null;
  return Math.round((con / sin - 1) * 100);
};

const SKIP_SHEETS = new Set<string>();
const USD_SHEETS = new Set(["GUATEMALA", "ECUADOR", "REDIVENCA", "LEVANIA"]);
// País destino. Las hojas en USD sin país conocido quedan en null (no se inventa).
const COUNTRY: Record<string, string> = {
  GUATEMALA: "Guatemala",
  ECUADOR: "Ecuador",
  REDIVENCA: "Venezuela",
};
const KIND: Record<string, PriceListKind> = {
  DIRECTOS: PriceListKind.segmento,
  DISTRIBUIDORES: PriceListKind.segmento,
  GUATEMALA: PriceListKind.export,
  ECUADOR: PriceListKind.export,
  REDIVENCA: PriceListKind.export,
  AGRICOLA: PriceListKind.linea,
  AQUAVET: PriceListKind.linea,
  QUANTICA: PriceListKind.linea,
  "SOLUCIONES NATURALES": PriceListKind.linea,
};

// Config manual para hojas sin encabezado limpio.
type Override = {
  dataStartRow: number;
  productCol: number;
  formCol: number;
  empaqueCol: number;
  dosageCol?: number;
  priceCols: number[];
};
const OVERRIDES: Record<string, Override> = {
  // AQUAVET no tiene fila "Producto"; datos corridos a la derecha.
  AQUAVET: { dataStartRow: 5, productCol: 4, formCol: 5, empaqueCol: 6, priceCols: [10, 11] },
  // LEVANIA trae 3 columnas de precio: 6 = COP, 7/8 = USD sin/con.
  // El cliente confirmó "tener en cuenta solo el dólar" → se ignora la de pesos.
  LEVANIA: { dataStartRow: 3, productCol: 2, formCol: 3, empaqueCol: 4, dosageCol: 5, priceCols: [7, 8] },
};

export type ParsedItem = {
  sheet: string;
  product: string;
  form: string;
  empaque: string;
  dosage: string;
  prices: { sin: number | null; con: number | null }[];
};

function findHeaderRow(ws: ExcelJS.Worksheet): number | null {
  for (let r = 1; r <= Math.min(8, ws.rowCount); r++) {
    for (let c = 1; c <= ws.columnCount; c++) {
      if (clean(ws.getRow(r).getCell(c).value).toLowerCase() === "producto") return r;
    }
  }
  return null;
}

/** Empareja columnas de precio contiguas en pares (sin, con). */
function pairUp(cols: number[]): [number, number | null][] {
  const pairs: [number, number | null][] = [];
  for (let i = 0; i < cols.length; i += 2) pairs.push([cols[i], cols[i + 1] ?? null]);
  return pairs;
}

export function parseSheet(ws: ExcelJS.Worksheet): { items: ParsedItem[]; note: string } {
  const name = ws.name.trim();
  const ov = OVERRIDES[name];
  let hr: number, cm: Record<string, number>, pairs: [number, number | null][];

  if (ov) {
    hr = ov.dataStartRow - 1;
    cm = { producto: ov.productCol, presentacion: ov.formCol, empaque: ov.empaqueCol };
    if (ov.dosageCol) cm.dosage = ov.dosageCol;
    pairs = pairUp(ov.priceCols);
  } else {
    const h = findHeaderRow(ws);
    if (!h) return { items: [], note: "SIN ENCABEZADO — falta config manual" };
    hr = h;
    cm = {};
    const priceCols: number[] = [];
    for (let c = 1; c <= ws.columnCount; c++) {
      const t = clean(ws.getRow(hr).getCell(c).value).toLowerCase();
      if (!t) continue;
      if (t === "producto") cm.producto = c;
      else if (t.startsWith("presentaci")) cm.presentacion = c;
      else if (t === "empaque") cm.empaque = c;
      else if (t.startsWith("dosificaci")) cm.dosage = c;
      else if (t.includes("precio")) priceCols.push(c);
    }
    if (!cm.producto || !cm.empaque || priceCols.length === 0)
      return { items: [], note: `columnas insuficientes` };
    pairs = pairUp(priceCols);
  }

  const items: ParsedItem[] = [];
  let curProd = "", curForm = "", curDose = "";
  for (let r = hr + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const p = clean(row.getCell(cm.producto).value);
    if (p) { curProd = p; curForm = ""; curDose = ""; }
    const form = cm.presentacion ? clean(row.getCell(cm.presentacion).value) : "";
    if (form) curForm = form;
    const dose = cm.dosage ? clean(row.getCell(cm.dosage).value) : "";
    if (dose) curDose = dose;
    const emp = clean(row.getCell(cm.empaque).value);
    const prices = pairs.map(([sc, cc]) => ({
      sin: num(row.getCell(sc).value),
      con: cc ? num(row.getCell(cc).value) : null,
    }));
    if (!curProd || !emp || !prices.some((x) => x.sin !== null || x.con !== null)) continue;
    items.push({ sheet: name, product: curProd, form: curForm, empaque: emp, dosage: curDose, prices });
  }
  return { items, note: `${pairs.length} par(es)` };
}

async function run(filePath: string, dry: boolean) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const items: ParsedItem[] = [];
  const skipped: string[] = [];
  const emptySheets: string[] = [];
  for (const ws of wb.worksheets) {
    const name = ws.name.trim();
    if (SKIP_SHEETS.has(name)) { skipped.push(name); continue; }
    const { items: its, note } = parseSheet(ws);
    if (its.length === 0) emptySheets.push(`${name} (${note})`);
    items.push(...its);
  }

  // Dedup productos y presentaciones.
  const products = new Map<string, { name: string; forms: string[] }>();
  const presentations = new Map<string, { productKey: string; empaque: string; form: string; dosage: string }>();
  for (const it of items) {
    const pk = prodKey(it.product);
    const prod = products.get(pk) ?? { name: it.product, forms: [] };
    if (it.form) prod.forms.push(it.form);
    products.set(pk, prod);
    const presKey = pk + "|" + it.empaque.toUpperCase();
    if (!presentations.has(presKey))
      presentations.set(presKey, { productKey: pk, empaque: it.empaque, form: it.form, dosage: it.dosage });
  }

  // basePrice provisional: primer conIva (o sinIva) disponible del producto,
  // priorizando DIRECTOS. El precio real vive en PriceListItem.
  // ponytail: basePrice queda vestigial hasta el selector de presentación en el UI de cotización.
  const PRIORITY = ["DIRECTOS", "DISTRIBUIDORES"];
  const basePriceByProd = new Map<string, number>();
  const sortedItems = [...items].sort(
    (a, b) => (PRIORITY.indexOf(b.sheet) - PRIORITY.indexOf(a.sheet)),
  );
  for (const it of sortedItems) {
    const pk = prodKey(it.product);
    if (basePriceByProd.has(pk)) continue;
    for (const p of it.prices) {
      const v = p.con ?? p.sin;
      if (v !== null) { basePriceByProd.set(pk, v); break; }
    }
  }

  // Anomalías a reportar (se suben igual).
  const negIva = items.filter((it) => {
    const t = deriveTaxPercent(it.prices[0].sin, it.prices[0].con);
    return t !== null && t < 0;
  });

  const report = {
    productos: products.size,
    presentaciones: presentations.size,
    items: items.length,
    listas: new Set(items.map((i) => i.sheet)).size,
    skipped,
    emptySheets,
    negIvaCount: negIva.length,
  };

  if (dry) {
    return { report, customerLinks: await matchCustomers(new PrismaClient(), items, true) };
  }

  const prisma = new PrismaClient();
  const admin = await prisma.user.findFirst({ where: { role: "administrador" }, select: { id: true } });
  if (!admin) throw new Error("No hay usuario administrador para atribuir createdBy.");
  const by = admin.id;

  // 1. Productos.
  const prodIdByKey = new Map<string, string>();
  for (const [pk, prod] of products) {
    const sku = skuFromName(prod.name);
    const unit = mode(prod.forms) || "unidad";
    const basePrice = basePriceByProd.get(pk) ?? 0;
    const existing = await prisma.product.findUnique({ where: { sku }, select: { id: true } });
    const data = { name: prod.name, unit, basePrice, updatedBy: by, active: true };
    const row = existing
      ? await prisma.product.update({ where: { id: existing.id }, data })
      : await prisma.product.create({ data: { sku, createdBy: by, ...data } });
    prodIdByKey.set(pk, row.id);
  }

  // 2. Presentaciones.
  const presIdByKey = new Map<string, string>();
  for (const [presKey, pres] of presentations) {
    const productId = prodIdByKey.get(pres.productKey)!;
    const row = await prisma.productPresentation.upsert({
      where: { productId_empaque: { productId, empaque: pres.empaque } },
      update: { form: pres.form || null, dosage: pres.dosage || null },
      create: { productId, empaque: pres.empaque, form: pres.form || null, dosage: pres.dosage || null },
      select: { id: true },
    });
    presIdByKey.set(presKey, row.id);
  }

  // 3. Listas + ítems.
  for (const sheet of new Set(items.map((i) => i.sheet))) {
    const listData = {
      currency: USD_SHEETS.has(sheet) ? "USD" : "COP",
      country: COUNTRY[sheet] ?? (USD_SHEETS.has(sheet) ? null : "Colombia"),
      kind: KIND[sheet] ?? PriceListKind.cliente,
    };
    const list = await prisma.priceList.upsert({
      where: { name: sheet },
      update: listData,
      create: { name: sheet, ...listData },
      select: { id: true },
    });
    for (const it of items.filter((i) => i.sheet === sheet)) {
      const presKey = prodKey(it.product) + "|" + it.empaque.toUpperCase();
      const presentationId = presIdByKey.get(presKey)!;
      const [p1, p2, p3] = it.prices;
      await prisma.priceListItem.upsert({
        where: { priceListId_presentationId: { priceListId: list.id, presentationId } },
        update: itemData(p1, p2, p3),
        create: { priceListId: list.id, presentationId, ...itemData(p1, p2, p3) },
      });
    }
  }

  const customerLinks = await matchCustomers(prisma, items, false);
  await prisma.$disconnect();
  return { report, customerLinks };
}

function itemData(p1: any, p2: any, p3: any) {
  return {
    priceSinIva: p1?.sin ?? null,
    priceConIva: p1?.con ?? null,
    taxPercent: deriveTaxPercent(p1?.sin ?? null, p1?.con ?? null),
    priceSinIva2: p2?.sin ?? null,
    priceConIva2: p2?.con ?? null,
    priceSinIva3: p3?.sin ?? null,
    priceConIva3: p3?.con ?? null,
  };
}

/** Engancha clientes por match INEQUÍVOCO (exactamente 1). Reporta el resto. */
async function matchCustomers(prisma: PrismaClient, items: ParsedItem[], dry: boolean) {
  const sheets = [...new Set(items.map((i) => i.sheet))];
  const linked: string[] = [];
  const ambiguousOrNone: string[] = [];
  for (const sheet of sheets) {
    if (KIND[sheet] === PriceListKind.segmento || KIND[sheet] === PriceListKind.linea) continue;
    const matches = await prisma.customer.findMany({
      where: { OR: [{ legalName: { contains: sheet, mode: "insensitive" } }, { displayName: { contains: sheet, mode: "insensitive" } }] },
      select: { id: true, displayName: true },
    });
    if (matches.length === 1) {
      linked.push(`${sheet} → ${matches[0].displayName}`);
      if (!dry) {
        // El cliente hereda el país de su lista: quien compra de una lista de
        // exportación no es colombiano, y el default "Colombia" mentiría.
        const list = await prisma.priceList.findUnique({ where: { name: sheet }, select: { id: true, country: true } });
        if (list)
          await prisma.customer.update({
            where: { id: matches[0].id },
            data: { priceListId: list.id, country: list.country },
          });
      }
    } else {
      ambiguousOrNone.push(`${sheet} (${matches.length} coincidencias) → asignar a mano`);
    }
  }
  await prisma.$disconnect();
  return { linked, ambiguousOrNone };
}

const mode = (xs: string[]): string | null => {
  if (!xs.length) return null;
  const c = new Map<string, number>();
  for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0][0];
};

async function main() {
  const filePath = process.argv[2];
  const dry = process.argv.includes("--dry");
  if (!filePath) {
    console.error("Uso: tsx prisma/scripts/import-catalog.ts <ruta.xlsx> [--dry]");
    process.exit(1);
  }
  const { report, customerLinks } = await run(filePath, dry);
  console.log(dry ? "\n═══ DRY-RUN (no escribe) ═══" : "\n═══ IMPORTADO ═══");
  console.log("Productos:", report.productos);
  console.log("Presentaciones:", report.presentaciones);
  console.log("Ítems de precio:", report.items);
  console.log("Listas:", report.listas);
  console.log("Hojas omitidas:", report.skipped.join(", ") || "—");
  if (report.emptySheets.length) console.log("Hojas sin ítems:", report.emptySheets.join("; "));
  console.log("Ítems con IVA negativo (subidos tal cual):", report.negIvaCount);
  console.log("\nClientes enganchados:");
  customerLinks.linked.forEach((s) => console.log("  ✓", s));
  console.log("Listas de cliente SIN enganchar (asignar a mano):");
  customerLinks.ambiguousOrNone.forEach((s) => console.log("  ⚠", s));
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
