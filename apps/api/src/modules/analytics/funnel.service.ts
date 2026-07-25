import { Injectable } from "@nestjs/common";
import { OpportunityStage, QuoteStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
  ResolvedFilters,
  average,
  customerWhere,
  days,
  envelope,
  money,
  percent,
  toNumber,
} from "./analytics.shared";

/** `lostReason` es texto libre: se muestran los N mas frecuentes y el resto agrupado. */
const TOP_REASONS = 8;

const STAGE_LABELS: Record<OpportunityStage, string> = {
  prospecto: "Prospecto",
  contacto: "Contacto",
  visita: "Visita",
  cotizacion: "Cotización",
  negociacion: "Negociación",
  orden_facturacion: "Orden de facturación",
  venta_cerrada: "Venta cerrada",
  perdida: "Perdida",
};

const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  abierta: "Abierta",
  en_negociacion: "En negociación",
  cerrada: "Cerrada",
  perdida: "Perdida",
};

const CLOSED_STAGES: OpportunityStage[] = [
  OpportunityStage.venta_cerrada,
  OpportunityStage.perdida,
];

@Injectable()
export class FunnelService {
  constructor(private readonly prisma: PrismaService) {}

  async getFunnel(filters: ResolvedFilters) {
    // Ni Opportunity ni Quote tienen companyId: la empresa se deriva del
    // cliente (§2.3). El vendedor de una oportunidad es su asignado.
    const scope = {
      customer: customerWhere(filters),
      ...(filters.sellerUserId ? { assignedToUserId: filters.sellerUserId } : {}),
    };

    const [opportunities, quotes] = await Promise.all([
      this.prisma.opportunity.findMany({
        where: {
          ...scope,
          // Abiertas: se cuentan las vivas hoy. Cerradas: las que cerraron
          // DENTRO del rango. Sin esto, "ganadas" crece para siempre.
          OR: [
            { stage: { notIn: CLOSED_STAGES } },
            { stage: { in: CLOSED_STAGES }, closedAt: { gte: filters.from, lte: filters.to } },
            { stage: { in: CLOSED_STAGES }, closedAt: null, updatedAt: { gte: filters.from, lte: filters.to } },
          ],
        },
        select: {
          id: true,
          stage: true,
          estimatedValue: true,
          lostReason: true,
          createdAt: true,
          closedAt: true,
          assignedToUserId: true,
        },
      }),
      this.prisma.quote.findMany({
        where: {
          createdAt: { gte: filters.from, lte: filters.to },
          customer: customerWhere(filters),
          ...(filters.sellerUserId
            ? { opportunity: { assignedToUserId: filters.sellerUserId } }
            : {}),
        },
        select: {
          id: true,
          status: true,
          total: true,
          createdAt: true,
          sourceOrders: { select: { orderDate: true }, orderBy: { orderDate: "asc" }, take: 1 },
        },
      }),
    ]);

    const valueOf = (value: unknown) => (value === null ? 0 : toNumber(value));

    const open = opportunities.filter((row) => !CLOSED_STAGES.includes(row.stage));
    const won = opportunities.filter((row) => row.stage === OpportunityStage.venta_cerrada);
    const lost = opportunities.filter((row) => row.stage === OpportunityStage.perdida);

    const sum = (rows: typeof opportunities) =>
      money(rows.reduce((total, row) => total + valueOf(row.estimatedValue), 0));

    // --- etapas -----------------------------------------------------------
    const stages = (Object.keys(STAGE_LABELS) as OpportunityStage[]).map((stage) => {
      const rows = opportunities.filter((row) => row.stage === stage);
      return {
        stage,
        label: STAGE_LABELS[stage],
        count: rows.length,
        value: sum(rows),
      };
    });

    // --- ciclo ------------------------------------------------------------
    // Sin `closedAt` no hay ciclo medible: esas filas no entran en el promedio
    // en vez de contar como ciclo cero.
    const cycles = [...won, ...lost]
      .filter((row) => row.closedAt !== null)
      .map((row) => days(row.createdAt, row.closedAt as Date));

    // --- motivos de perdida (texto libre) ---------------------------------
    const reasons = new Map<string, { label: string; count: number; value: number }>();
    for (const row of lost) {
      const raw = row.lostReason?.trim();
      if (!raw) continue;
      const key = raw.toLowerCase();
      let bucket = reasons.get(key);
      if (!bucket) {
        bucket = { label: raw, count: 0, value: 0 };
        reasons.set(key, bucket);
      }
      bucket.count += 1;
      bucket.value += valueOf(row.estimatedValue);
    }
    const sortedReasons = [...reasons.values()].sort((a, b) => b.count - a.count);
    const topReasons = sortedReasons.slice(0, TOP_REASONS);
    const tail = sortedReasons.slice(TOP_REASONS);
    const lostValue = sum(lost);
    const lostReasons = [
      ...topReasons.map((bucket) => ({
        reason: bucket.label,
        count: bucket.count,
        value: money(bucket.value),
        sharePercent: percent(bucket.count, lost.length),
        isOther: false,
      })),
      ...(tail.length > 0
        ? [
            {
              reason: `Otros (${tail.length} motivos)`,
              count: tail.reduce((total, bucket) => total + bucket.count, 0),
              value: money(tail.reduce((total, bucket) => total + bucket.value, 0)),
              sharePercent: percent(
                tail.reduce((total, bucket) => total + bucket.count, 0),
                lost.length,
              ),
              isOther: true,
            },
          ]
        : []),
    ];

    // --- cotizaciones -----------------------------------------------------
    // La conversion se mide con `Order.sourceQuoteId`: es un enlace real, no
    // una estimacion.
    const converted = quotes.filter((quote) => quote.sourceOrders.length > 0);
    const daysToOrder = converted.map((quote) =>
      days(quote.createdAt, quote.sourceOrders[0].orderDate),
    );

    // --- por vendedor -----------------------------------------------------
    // `Opportunity.assignedToUserId` no tiene relacion en el schema: el nombre
    // se resuelve aparte, si no todo el panel saldria como "Sin vendedor".
    const sellerIds = [
      ...new Set(opportunities.map((row) => row.assignedToUserId).filter((id): id is string => !!id)),
    ];
    const sellerNames = new Map(
      (
        await this.prisma.user.findMany({
          where: { id: { in: sellerIds } },
          select: { id: true, name: true },
        })
      ).map((user) => [user.id, user.name]),
    );

    const bySellerMap = new Map<
      string,
      {
        sellerId: string | null;
        sellerName: string;
        openCount: number;
        openValue: number;
        wonCount: number;
        wonValue: number;
        lostCount: number;
        cycles: number[];
      }
    >();
    for (const row of opportunities) {
      const key = row.assignedToUserId ?? "sin-vendedor";
      let bucket = bySellerMap.get(key);
      if (!bucket) {
        bucket = {
          sellerId: row.assignedToUserId ?? null,
          sellerName: row.assignedToUserId
            ? sellerNames.get(row.assignedToUserId) ?? "Sin nombre"
            : "Sin vendedor",
          openCount: 0,
          openValue: 0,
          wonCount: 0,
          wonValue: 0,
          lostCount: 0,
          cycles: [],
        };
        bySellerMap.set(key, bucket);
      }
      const value = valueOf(row.estimatedValue);
      if (row.stage === OpportunityStage.venta_cerrada) {
        bucket.wonCount += 1;
        bucket.wonValue += value;
      } else if (row.stage === OpportunityStage.perdida) {
        bucket.lostCount += 1;
      } else {
        bucket.openCount += 1;
        bucket.openValue += value;
      }
      if (row.closedAt) bucket.cycles.push(days(row.createdAt, row.closedAt));
    }

    const bySeller = [...bySellerMap.values()]
      .map((bucket) => ({
        sellerId: bucket.sellerId,
        sellerName: bucket.sellerName,
        openCount: bucket.openCount,
        openValue: money(bucket.openValue),
        wonCount: bucket.wonCount,
        wonValue: money(bucket.wonValue),
        lostCount: bucket.lostCount,
        winRate: percent(bucket.wonCount, bucket.wonCount + bucket.lostCount),
        avgCycleDays: average(bucket.cycles),
      }))
      .sort((a, b) => b.wonValue - a.wonValue);

    return {
      ...envelope(filters),
      totals: {
        openCount: open.length,
        openValue: sum(open),
        openWithoutValueCount: open.filter((row) => row.estimatedValue === null).length,
        wonCount: won.length,
        wonValue: sum(won),
        lostCount: lost.length,
        lostValue,
        winRate: percent(won.length, won.length + lost.length),
        avgCycleDays: average(cycles),
      },
      stages,
      quotes: {
        total: quotes.length,
        totalValue: money(quotes.reduce((total, quote) => total + toNumber(quote.total), 0)),
        byStatus: (Object.keys(QUOTE_STATUS_LABELS) as QuoteStatus[]).map((status) => {
          const rows = quotes.filter((quote) => quote.status === status);
          return {
            status,
            label: QUOTE_STATUS_LABELS[status],
            count: rows.length,
            value: money(rows.reduce((total, quote) => total + toNumber(quote.total), 0)),
          };
        }),
        convertedCount: converted.length,
        conversionRate: percent(converted.length, quotes.length),
        avgDaysToOrder: average(daysToOrder),
      },
      lostReasons,
      breakdowns: { bySeller },
      csvRows: bySeller,
    };
  }
}
