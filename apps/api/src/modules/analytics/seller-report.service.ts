import { Injectable } from "@nestjs/common";
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthUser } from "../auth/types/authenticated-request";
import { SellerGoalsService } from "../seller-goals/seller-goals.service";
import { ResolvedFilters, bogotaDate } from "./analytics.shared";
import { SalesService } from "./sales.service";
import { SellerPerformanceService } from "./seller-performance.service";

/**
 * Informe de desempeño en PDF: "como voy" para presentarlo el lunes.
 *
 * NO calcula nada: consume tal cual lo que ya devuelven `sales` y
 * `seller-performance` con los MISMOS `ResolvedFilters` de las pantallas. Por
 * eso el acotado por rol es automatico: si `resolveFilters` le forzo el
 * `sellerUserId` a un comercial, el PDF sale con lo suyo y punto (§2.4).
 */

type Sales = Awaited<ReturnType<SalesService["getSales"]>>;
type Performance = Awaited<ReturnType<SellerPerformanceService["getSellerPerformance"]>>;
type Goal = Awaited<ReturnType<SellerGoalsService["getProgress"]>> | null;

@Injectable()
export class SellerReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly salesService: SalesService,
    private readonly sellerPerformanceService: SellerPerformanceService,
    private readonly sellerGoalsService: SellerGoalsService,
  ) {}

  async generate(user: AuthUser, filters: ResolvedFilters): Promise<Buffer> {
    const [sales, performance, sellerName, goal] = await Promise.all([
      this.salesService.getSales(filters),
      this.sellerPerformanceService.getSellerPerformance(filters),
      this.resolveSellerName(filters.sellerUserId),
      this.resolveGoal(user, filters.sellerUserId),
    ]);

    return buildPdf({ sellerName, filters, sales, performance, goal });
  }

  private async resolveSellerName(sellerUserId: string | null): Promise<string> {
    if (!sellerUserId) return "Equipo comercial";
    const seller = await this.prisma.user.findUnique({
      where: { id: sellerUserId },
      select: { name: true },
    });
    return seller?.name ?? "Vendedor";
  }

  /**
   * La meta vive en `seller-goals` y tiene su PROPIO periodo (mensual, anual):
   * no es el rango del informe, y por eso se imprime con su periodo al lado.
   * `getProgress` revalida el acceso por su cuenta (un comercial solo puede
   * leer la suya), asi que traerla aqui no abre nada.
   */
  private async resolveGoal(user: AuthUser, sellerUserId: string | null): Promise<Goal> {
    if (!sellerUserId) return null; // El consolidado del equipo no tiene una sola meta.
    try {
      return await this.sellerGoalsService.getProgress(user, sellerUserId);
    } catch {
      // Sin meta cargada para el vendedor: el informe lo dice y sigue.
      return null;
    }
  }
}

// --- dibujo ----------------------------------------------------------------

const BRAND = rgb(0.06, 0.36, 0.54);
const INK = rgb(0.1, 0.12, 0.15);
const MUTED = rgb(0.42, 0.46, 0.5);
const GOOD = rgb(0, 0.65, 0.32);
const BAD = rgb(0.93, 0.11, 0.15);
const LINE = rgb(0.85, 0.87, 0.89);
const ZEBRA = rgb(0.96, 0.97, 0.98);
const WHITE = rgb(1, 1, 1);

const PAGE: [number, number] = [612, 792];
const MARGIN = 48;
const RIGHT = PAGE[0] - MARGIN;
const WIDTH = RIGHT - MARGIN;
const TOP_ROWS = 10;

const MONTHS = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

const SYMBOL: Record<string, string> = { COP: "$", USD: "US$" };

/**
 * Helvetica es WinAnsi: un caracter fuera de cp1252 (un emoji, o las comillas
 * curvas de un nombre pegado desde Word) hace estallar `drawText`. Un informe
 * no se cae por el nombre de un cliente: la puntuacion tipografica se degrada a
 * su equivalente ASCII y lo demas se descarta.
 */
function safe(value: string): string {
  return value
    .replace(/[‐-―]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
}

function money(value: number, currency: string): string {
  const symbol = SYMBOL[currency] ?? "";
  const absolute = Math.abs(Math.round(value));
  return `${value < 0 ? "-" : ""}${symbol}${absolute.toLocaleString("es-CO")}`;
}

function decimal(value: number): string {
  return value.toLocaleString("es-CO", { maximumFractionDigits: 1 });
}

function percent(value: number): string {
  return `${decimal(value)}%`;
}

function signed(value: number): string {
  return `${value > 0 ? "+" : ""}${percent(value)}`;
}

/** `2026-07-25` -> `25 jul 2026`. Sin `Date`: la cadena ya es fecha de Bogota. */
function longDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${Number(day)} ${MONTHS[Number(month) - 1] ?? ""} ${year}`;
}

interface Payload {
  sellerName: string;
  filters: ResolvedFilters;
  sales: Sales;
  performance: Performance;
  goal: Goal;
}

async function buildPdf({ sellerName, filters, sales, performance, goal }: Payload): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = pdf.addPage(PAGE);
  let y = PAGE[1];

  const write = (
    text: string,
    x: number,
    top: number,
    options: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; align?: "left" | "right" } = {},
  ) => {
    const size = options.size ?? 10;
    const face: PDFFont = options.bold ? bold : font;
    const value = safe(text);
    const width = options.align === "right" ? face.widthOfTextAtSize(value, size) : 0;
    page.drawText(value, {
      x: x - width,
      y: top,
      size,
      font: face,
      color: options.color ?? INK,
    });
  };

  /** Recorta al ancho disponible para que dos columnas nunca se pisen. */
  const clip = (text: string, size: number, max: number) => {
    let value = safe(text);
    if (font.widthOfTextAtSize(value, size) <= max) return value;
    while (value.length > 3 && font.widthOfTextAtSize(`${value}...`, size) > max) {
      value = value.slice(0, -1);
    }
    return `${value}...`;
  };

  const newPage = () => {
    page = pdf.addPage(PAGE);
    y = PAGE[1] - MARGIN;
  };

  const ensure = (height: number) => {
    if (y - height < MARGIN + 20) newPage();
  };

  const section = (title: string, note?: string) => {
    ensure(46);
    y -= 26;
    write(title, MARGIN, y, { size: 13, bold: true, color: BRAND });
    if (note) write(note, RIGHT, y + 1, { size: 8.5, color: MUTED, align: "right" });
    y -= 8;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: RIGHT, y },
      thickness: 1,
      color: LINE,
    });
    y -= 6;
  };

  // --- cabecera ------------------------------------------------------------
  y -= 88;
  page.drawRectangle({ x: 0, y, width: PAGE[0], height: 88, color: BRAND });
  write("INFORME DE DESEMPEÑO COMERCIAL", MARGIN, y + 56, { size: 9, bold: true, color: rgb(0.72, 0.85, 0.94) });
  write(sellerName, MARGIN, y + 32, { size: 21, bold: true, color: WHITE });
  write(
    `${longDate(filters.fromDate)} — ${longDate(filters.toDate)} · cifras en ${filters.currency}`,
    MARGIN,
    y + 14,
    { size: 10, color: rgb(0.82, 0.9, 0.96) },
  );

  // --- resumen -------------------------------------------------------------
  const change = sales.previous.changePercent;
  const headline =
    sales.previous.netRevenue === 0
      ? `Venta neta de ${money(sales.totals.netRevenue, filters.currency)} en ${sales.totals.orderCount} pedidos. Sin venta comparable el año pasado.`
      : `Venta neta de ${money(sales.totals.netRevenue, filters.currency)} en ${sales.totals.orderCount} pedidos: ${signed(change)} frente al mismo periodo del año pasado.`;

  y -= 30;
  write(clip(headline, 11, WIDTH), MARGIN, y, { size: 11 });

  // --- tarjetas ------------------------------------------------------------
  const cards: { label: string; value: string; meta: string; color?: ReturnType<typeof rgb> }[] = [
    {
      label: "VENTA NETA",
      value: money(sales.totals.netRevenue, filters.currency),
      meta: `${sales.totals.orderCount} pedidos · ${sales.totals.customerCount} clientes`,
      color: BRAND,
    },
    {
      label: "VS. AÑO ANTERIOR",
      value: sales.previous.netRevenue === 0 ? "sin base" : signed(change),
      meta: `${money(sales.previous.netRevenue, filters.currency)} en ${sales.previous.from.slice(0, 4)}`,
      color: sales.previous.netRevenue === 0 ? MUTED : change < 0 ? BAD : GOOD,
    },
    {
      label: "TICKET PROMEDIO",
      value: money(sales.totals.avgTicket, filters.currency),
      meta: `descuento medio ${percent(sales.totals.avgDiscountPercent)}`,
    },
  ];

  y -= 76;
  const cardWidth = (WIDTH - 24) / 3;
  cards.forEach((card, index) => {
    const x = MARGIN + index * (cardWidth + 12);
    page.drawRectangle({
      x,
      y,
      width: cardWidth,
      height: 62,
      color: ZEBRA,
      borderColor: LINE,
      borderWidth: 1,
    });
    write(card.label, x + 12, y + 44, { size: 7.5, bold: true, color: MUTED });
    write(clip(card.value, 17, cardWidth - 24), x + 12, y + 22, {
      size: 17,
      bold: true,
      color: card.color ?? INK,
    });
    write(clip(card.meta, 8, cardWidth - 24), x + 12, y + 9, { size: 8, color: MUTED });
  });

  // --- meta ----------------------------------------------------------------
  section("Avance de meta", goal ? `meta ${goal.periodType} ${goal.periodValue}` : undefined);
  if (!goal) {
    y -= 16;
    write(
      filters.sellerUserId
        ? "Sin meta asignada para este vendedor: el avance no se puede calcular."
        : "El informe consolidado del equipo no tiene una meta única. Filtre por un vendedor para verla.",
      MARGIN,
      y,
      { size: 10, color: MUTED },
    );
    y -= 8;
  } else {
    const filled = Math.max(0, Math.min(100, goal.percentage)) / 100;
    y -= 22;
    write(percent(goal.percentage), MARGIN, y, {
      size: 17,
      bold: true,
      color: goal.percentage >= 100 ? GOOD : goal.percentage >= 70 ? BRAND : BAD,
    });
    write(
      `${money(goal.soldAmount, filters.currency)} de ${money(goal.targetAmount, filters.currency)}`,
      RIGHT,
      y + 4,
      { size: 10, bold: true, align: "right" },
    );
    write(
      goal.remainingAmount > 0
        ? `faltan ${money(goal.remainingAmount, filters.currency)}`
        : "meta cumplida",
      RIGHT,
      y - 9,
      { size: 8.5, color: MUTED, align: "right" },
    );
    y -= 24;
    page.drawRectangle({ x: MARGIN, y, width: WIDTH, height: 9, color: LINE });
    if (filled > 0) {
      page.drawRectangle({
        x: MARGIN,
        y,
        width: WIDTH * filled,
        height: 9,
        color: goal.percentage >= 100 ? GOOD : BRAND,
      });
    }
    y -= 12;
    write(
      `El avance se mide sobre el periodo de la meta (${goal.periodValue}), no sobre el rango de este informe.`,
      MARGIN,
      y,
      { size: 8, color: MUTED },
    );
    y -= 6;
  }

  // --- top clientes --------------------------------------------------------
  const customers = sales.breakdowns.byCustomer.slice(0, TOP_ROWS);
  section(
    "Top clientes del periodo",
    sales.breakdowns.byCustomerTotal > customers.length
      ? `${customers.length} de ${sales.breakdowns.byCustomerTotal} clientes`
      : undefined,
  );

  y -= 16;
  write("Cliente", MARGIN + 8, y, { size: 8, bold: true, color: MUTED });
  write("Venta neta", MARGIN + 320, y, { size: 8, bold: true, color: MUTED, align: "right" });
  write("Pedidos", MARGIN + 386, y, { size: 8, bold: true, color: MUTED, align: "right" });
  write("Últ. compra", MARGIN + 452, y, { size: 8, bold: true, color: MUTED, align: "right" });
  write("Part.", RIGHT - 8, y, { size: 8, bold: true, color: MUTED, align: "right" });
  y -= 4;

  if (customers.length === 0) {
    y -= 16;
    write("Sin pedidos en el periodo.", MARGIN + 8, y, { size: 10, color: MUTED });
    y -= 8;
  }

  customers.forEach((row, index) => {
    ensure(20);
    y -= 19;
    if (index % 2 === 1) {
      page.drawRectangle({ x: MARGIN, y: y - 5, width: WIDTH, height: 19, color: ZEBRA });
    }
    write(clip(row.customerName, 9.5, 290), MARGIN + 8, y, { size: 9.5 });
    write(money(row.netRevenue, filters.currency), MARGIN + 320, y, { size: 9.5, bold: true, align: "right" });
    write(String(row.orderCount), MARGIN + 386, y, { size: 9.5, align: "right", color: MUTED });
    write(row.lastOrderDate ? longDate(row.lastOrderDate.slice(0, 10)) : "—", MARGIN + 452, y, {
      size: 9.5,
      align: "right",
      color: MUTED,
    });
    write(percent(row.sharePercent), RIGHT - 8, y, { size: 9.5, align: "right" });
  });
  y -= 6;

  // --- actividad -----------------------------------------------------------
  const dormant = performance.breakdowns.bySeller.reduce((sum, row) => sum + row.dormantCustomers, 0);
  const activity: { label: string; value: string; meta: string }[] = [
    {
      label: "Cumplimiento de visitas",
      value: percent(performance.totals.visitCompliance),
      meta: `${performance.totals.visitsCompleted} completadas de ${performance.totals.visitsScheduled} programadas`,
    },
    {
      label: "Tareas vencidas",
      value: String(performance.totals.tasksOverdue),
      meta: performance.totals.tasksOverdue === 0 ? "al día" : "seguimientos sin cerrar a hoy",
    },
    {
      label: "Clientes dormidos",
      value: String(dormant),
      meta: "clientes asignados sin ningún pedido en el periodo",
    },
    {
      label: "Costo comercial",
      value: money(performance.totals.expenseTotal, filters.currency),
      meta: `${percent(performance.totals.expenseRatio)} de la venta · no es margen`,
    },
  ];

  section("Actividad y cumplimiento");
  activity.forEach((item) => {
    ensure(22);
    y -= 21;
    write(item.label, MARGIN + 8, y, { size: 10, bold: true });
    write(clip(item.meta, 8.5, 220), MARGIN + 200, y, { size: 8.5, color: MUTED });
    write(item.value, RIGHT - 8, y - 1, { size: 12, bold: true, align: "right" });
  });
  y -= 6;

  if (performance.totals.pendingExpenseTotal > 0) {
    ensure(20);
    y -= 18;
    write(
      `${money(performance.totals.pendingExpenseTotal, filters.currency)} en gastos esperan aprobación y quedan fuera de estos cálculos.`,
      MARGIN + 8,
      y,
      { size: 8.5, color: MUTED },
    );
  }

  // --- pie -----------------------------------------------------------------
  // Fecha de pared en Bogota: con el servidor en UTC, un informe bajado a las
  // 19:00 saldria fechado al dia siguiente.
  const generated = bogotaDate(new Date());
  for (const sheet of pdf.getPages()) {
    sheet.drawText(
      safe(`Norgtech · generado el ${longDate(generated)} · ${sellerName} · ${filters.fromDate} a ${filters.toDate}`),
      { x: MARGIN, y: 28, size: 7.5, font, color: MUTED },
    );
  }

  return Buffer.from(await pdf.save());
}
