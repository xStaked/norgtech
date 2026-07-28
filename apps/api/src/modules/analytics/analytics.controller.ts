import {
  Controller,
  Get,
  Query,
  Res,
  StreamableFile,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import type { Response } from "express";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { AuthUser } from "../auth/types/authenticated-request";
import { AnalyticsFiltersQueryDto } from "./dto/analytics-filters.query.dto";
import { CsvColumn, resolveAsOf, resolveFilters, toCsv } from "./analytics.shared";
import { FunnelService } from "./funnel.service";
import { ReceivablesService } from "./receivables.service";
import { SalesService } from "./sales.service";
import { SellerPerformanceService } from "./seller-performance.service";
import { SellerReportService } from "./seller-report.service";

type Row = Record<string, unknown>;

const text = (row: Row, key: string) => (row[key] === null || row[key] === undefined ? "" : String(row[key]));
const num = (row: Row, key: string) => (typeof row[key] === "number" ? (row[key] as number) : "");

/** El CSV exporta el breakdown principal de cada pantalla (spec §2.5). */
const CSV_COLUMNS: Record<string, CsvColumn<Row>[]> = {
  sales: [
    { header: "Cliente", value: (row) => text(row, "customerName") },
    { header: "Venta neta", value: (row) => num(row, "netRevenue") },
    { header: "Pedidos", value: (row) => num(row, "orderCount") },
    { header: "Ultima compra", value: (row) => text(row, "lastOrderDate").slice(0, 10) },
    { header: "Participacion %", value: (row) => num(row, "sharePercent") },
  ],
  receivables: [
    { header: "Cliente", value: (row) => text(row, "customerName") },
    { header: "Vendedor", value: (row) => text(row, "sellerName") },
    { header: "Saldo", value: (row) => num(row, "outstanding") },
    { header: "Vencido", value: (row) => num(row, "overdue") },
    { header: "Mora maxima (dias)", value: (row) => num(row, "maxDaysPastDue") },
    { header: "Cupo", value: (row) => num(row, "creditLimit") },
    { header: "Uso del cupo %", value: (row) => num(row, "creditUsagePercent") },
    { header: "Condicion de pago", value: (row) => text(row, "paymentCondition") },
  ],
  funnel: [
    { header: "Vendedor", value: (row) => text(row, "sellerName") },
    { header: "Abiertas", value: (row) => num(row, "openCount") },
    { header: "En juego", value: (row) => num(row, "openValue") },
    { header: "Ganadas", value: (row) => num(row, "wonCount") },
    { header: "Valor ganado", value: (row) => num(row, "wonValue") },
    { header: "Perdidas", value: (row) => num(row, "lostCount") },
    { header: "Tasa de cierre %", value: (row) => num(row, "winRate") },
    { header: "Ciclo (dias)", value: (row) => num(row, "avgCycleDays") },
  ],
  "seller-performance": [
    { header: "Vendedor", value: (row) => text(row, "sellerName") },
    { header: "Venta neta", value: (row) => num(row, "netRevenue") },
    { header: "Pedidos", value: (row) => num(row, "orderCount") },
    { header: "Clientes", value: (row) => num(row, "customerCount") },
    { header: "Gasto", value: (row) => num(row, "expenseTotal") },
    { header: "Costo sobre venta %", value: (row) => num(row, "expenseRatio") },
    { header: "Costo por pedido", value: (row) => num(row, "costPerOrder") },
    { header: "Cumplimiento visitas %", value: (row) => num(row, "visitCompliance") },
    { header: "Venta por visita", value: (row) => num(row, "revenuePerVisit") },
    { header: "Tareas vencidas", value: (row) => num(row, "tasksOverdue") },
    { header: "Clientes dormidos", value: (row) => num(row, "dormantCustomers") },
  ],
};

/**
 * Analitica: 4 pantallas, un solo juego de filtros (docs/analytics-spec.md).
 *
 * ACCESO: `administrador` y `director_comercial` ven la operacion completa; un
 * `comercial` entra a las mismas 4 pantallas pero solo con lo suyo, porque
 * `resolveFilters` le fuerza `sellerUserId` a su propio id (§2.4). Los demas
 * roles no entran.
 */
@Controller("analytics")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("administrador", "director_comercial", "comercial")
export class AnalyticsController {
  constructor(
    private readonly salesService: SalesService,
    private readonly receivablesService: ReceivablesService,
    private readonly funnelService: FunnelService,
    private readonly sellerPerformanceService: SellerPerformanceService,
    private readonly sellerReportService: SellerReportService,
  ) {}

  @Get("sales")
  async getSales(
    @CurrentUser() user: AuthUser,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: AnalyticsFiltersQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const filters = resolveFilters(query, user);
    return this.render("sales", await this.salesService.getSales(filters), filters.csv, response);
  }

  @Get("receivables")
  async getReceivables(
    @CurrentUser() user: AuthUser,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: AnalyticsFiltersQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const filters = resolveAsOf(query, user);
    return this.render(
      "receivables",
      await this.receivablesService.getReceivables(filters),
      filters.csv,
      response,
    );
  }

  @Get("funnel")
  async getFunnel(
    @CurrentUser() user: AuthUser,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: AnalyticsFiltersQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const filters = resolveFilters(query, user);
    return this.render("funnel", await this.funnelService.getFunnel(filters), filters.csv, response);
  }

  @Get("seller-performance")
  async getSellerPerformance(
    @CurrentUser() user: AuthUser,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: AnalyticsFiltersQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const filters = resolveFilters(query, user);

    // `format=pdf` sale por los MISMOS filtros ya resueltos: un comercial baja
    // su informe y nada mas, sin un camino paralelo que se saltee el forzado.
    if (filters.pdf) {
      return new StreamableFile(await this.sellerReportService.generate(user, filters), {
        type: "application/pdf",
        disposition: `attachment; filename="informe-desempeno-${filters.fromDate}-${filters.toDate}.pdf"`,
      });
    }

    return this.render(
      "seller-performance",
      await this.sellerPerformanceService.getSellerPerformance(filters),
      filters.csv,
      response,
    );
  }

  /**
   * `csvRows` es el breakdown COMPLETO (sin truncar): el JSON manda top-N para
   * que la pantalla no se vuelva un listado, pero el CSV se lleva todo.
   */
  private render(
    name: string,
    payload: { csvRows: unknown[] } & Record<string, unknown>,
    csv: boolean,
    response: Response,
  ) {
    const { csvRows, ...body } = payload;
    if (!csv) return body;

    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader("Content-Disposition", `attachment; filename="analytics-${name}.csv"`);
    return toCsv(csvRows as Row[], CSV_COLUMNS[name]);
  }
}
