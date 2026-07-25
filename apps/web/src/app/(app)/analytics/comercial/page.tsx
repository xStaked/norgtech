import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { AnalyticsFilters } from "@/components/analytics/analytics-filters";
import { AnalyticsHeader } from "@/components/analytics/analytics-header";
import {
  CardHeading,
  Chip,
  DataGrid,
  GridRow,
  Kpi,
  MeterCell,
  NoData,
  Notice,
} from "@/components/analytics/analytics-ui";
import { SectionCard } from "@/components/ui/section-card";
import {
  type AnalyticsEnvelope,
  type SearchParams,
  count,
  fetchAnalytics,
  fetchFilterOptions,
  money,
  number,
  percent,
  toneAscending,
  toneDescending,
} from "@/lib/analytics";

interface SellerPerformanceResponse extends AnalyticsEnvelope {
  totals: {
    netRevenue: number;
    expenseTotal: number;
    expenseRatio: number;
    pendingExpenseTotal: number;
    visitsScheduled: number;
    visitsCompleted: number;
    visitCompliance: number;
    tasksOverdue: number;
  };
  expenseByCategory: {
    category: string;
    label: string;
    amount: number;
    count: number;
    sharePercent: number;
  }[];
  breakdowns: {
    bySeller: {
      sellerId: string | null;
      sellerName: string;
      netRevenue: number;
      orderCount: number;
      customerCount: number;
      expenseTotal: number;
      expenseRatio: number;
      costPerOrder: number;
      pendingExpenseTotal: number;
      visitsScheduled: number;
      visitsCompleted: number;
      visitCompliance: number;
      revenuePerVisit: number;
      tasksOverdue: number;
      dormantCustomers: number;
    }[];
  };
}

const CATEGORY_COLORS = [
  "#0f5c8a",
  "#2ea3da",
  "#00a651",
  "#a7ce39",
  "#ffcb06",
  "#f58221",
  "#ee1c25",
  "#6d4ff0",
];

const COLUMNS =
  "minmax(160px,1.15fr) 110px 60px 100px 130px 100px 130px 100px 70px 80px";

export default async function AnalyticsSellerPerformancePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const [data, options] = await Promise.all([
    fetchAnalytics<SellerPerformanceResponse>("seller-performance", params),
    fetchFilterOptions(),
  ]);

  const description =
    "Qué cuesta cada vendedor, qué trae, y si está haciendo el trabajo de campo.";

  if (!data) {
    return (
      <div className="grid gap-6">
        <AnalyticsHeader
          title="Desempeño comercial"
          description={description}
          screen="comercial"
          params={params}
        />
        <SectionCard>
          <NoData>No se pudo cargar la analítica de desempeño.</NoData>
        </SectionCard>
      </div>
    );
  }

  const { totals, expenseByCategory, breakdowns } = data;

  return (
    <div className="grid gap-6">
      <AnalyticsHeader
        title="Desempeño comercial"
        description={description}
        screen="comercial"
        params={params}
        extraActions={
          // Las metas ya viven en el dashboard: se enlaza, no se duplica.
          <Link
            href="/dashboard"
            className="flex h-9 items-center rounded-lg border border-input bg-card px-3.5 text-[13px] font-bold text-primary transition-colors hover:bg-muted"
          >
            Ver metas en Dashboard →
          </Link>
        }
      />

      <AnalyticsFilters
        options={options}
        currency={data.currency}
        applied={data.filters}
        mode="range"
        range={data.range}
        note={`Costo comercial en ${data.currency} · no incluye costo de producto`}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi brand label="Venta neta" value={money(totals.netRevenue, data.currency)} />
        <Kpi
          label="Costo comercial"
          value={money(totals.expenseTotal, data.currency)}
          meta="aprobado + contabilizado"
        />
        <Kpi
          dot
          tone={toneDescending(totals.expenseRatio, 5, 10)}
          label="Costo sobre venta"
          value={percent(totals.expenseRatio)}
          meta="no es margen — no hay costo de producto"
        />
        <Kpi
          dot
          tone={toneAscending(totals.visitCompliance, 70, 85)}
          label="Cumplimiento de visitas"
          value={percent(totals.visitCompliance)}
          meta={`${count(totals.visitsCompleted)} de ${count(totals.visitsScheduled)} programadas`}
        />
      </div>

      {totals.pendingExpenseTotal > 0 ? (
        <Notice
          icon={<TriangleAlert className="h-4 w-4" aria-hidden="true" />}
          title={`${money(totals.pendingExpenseTotal, data.currency)} en gastos esperan aprobación`}
          description="Pendientes y por corregir — excluidos de todos los cálculos de esta pantalla."
          action={
            <Link
              href="/expenses"
              className="h-8 shrink-0 rounded-[7px] bg-primary px-3.5 text-[12.5px] font-bold leading-8 text-primary-foreground"
            >
              Revisar gastos
            </Link>
          }
        />
      ) : null}

      <div className="overflow-hidden rounded-[11px] border border-border bg-card">
        <CardHeading
          title="Matriz por vendedor"
          description="Costo sobre venta = qué % de la venta costó venderla. No es margen: no hay costo de producto en el sistema."
        />
        {breakdowns.bySeller.length === 0 ? (
          <NoData />
        ) : (
          <DataGrid
            columns={COLUMNS}
            header={
              <>
                <div>Vendedor</div>
                <div className="text-right">Venta neta</div>
                <div className="text-right">Ped.</div>
                <div className="text-right">Gasto</div>
                <div>Costo/venta</div>
                <div className="text-right">Costo/pedido</div>
                <div>Cumpl. visitas</div>
                <div className="text-right">Venta/visita</div>
                <div className="text-center">Tareas</div>
                <div className="text-center">Dormidos</div>
              </>
            }
            footer={
              <div className="flex flex-wrap items-center gap-4 border-t border-border/70 bg-muted/40 px-[18px] py-2.5 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-[#00a651]" />
                  Bueno
                </span>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-[#f58221]" />
                  Atención
                </span>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-[#ee1c25]" />
                  Crítico
                </span>
                <span className="ml-auto">
                  Dormidos = clientes asignados sin pedido en el período
                </span>
              </div>
            }
          >
            {breakdowns.bySeller.map((row, index) => (
              <GridRow
                key={row.sellerId ?? row.sellerName}
                columns={COLUMNS}
                zebra={index % 2 === 1}
                height={56}
              >
                <div className="min-w-0 py-2">
                  <div className="truncate font-bold">{row.sellerName}</div>
                  <div className="text-[10.5px] text-muted-foreground">
                    {count(row.customerCount)} clientes
                  </div>
                </div>
                <div className="text-right font-bold tabular-nums">
                  {money(row.netRevenue, data.currency)}
                </div>
                <div className="text-right tabular-nums text-muted-foreground">
                  {count(row.orderCount)}
                </div>
                <div className="text-right font-semibold tabular-nums">
                  {money(row.expenseTotal, data.currency)}
                </div>
                <MeterCell
                  percentValue={row.expenseRatio}
                  label={percent(row.expenseRatio)}
                  tone={toneDescending(row.expenseRatio, 5, 10)}
                  width={15}
                />
                <div className="text-right tabular-nums text-muted-foreground">
                  {money(row.costPerOrder, data.currency)}
                </div>
                <MeterCell
                  percentValue={row.visitCompliance}
                  label={percent(row.visitCompliance)}
                  tone={toneAscending(row.visitCompliance, 70, 85)}
                />
                <div className="text-right font-semibold tabular-nums">
                  {money(row.revenuePerVisit, data.currency)}
                </div>
                <div className="text-center">
                  {row.tasksOverdue > 0 ? (
                    <Chip tone={toneDescending(row.tasksOverdue, 3, 8)}>
                      {count(row.tasksOverdue)}
                    </Chip>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">0</span>
                  )}
                </div>
                <div className="text-center tabular-nums text-muted-foreground">
                  {count(row.dormantCustomers)}
                </div>
              </GridRow>
            ))}
          </DataGrid>
        )}
      </div>

      <SectionCard
        title="Gasto por categoría"
        description={`${money(totals.expenseTotal, data.currency)} contabilizable · aprobado + contabilizado`}
      >
        {expenseByCategory.length === 0 ? (
          <NoData>Sin gastos contabilizables en este período.</NoData>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {expenseByCategory.map((category, index) => (
              <div
                key={category.category}
                className="rounded-[9px] border border-border/70 bg-muted/40 px-3.5 py-3"
              >
                <div className="mb-1.5 flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ background: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }}
                  />
                  <span className="text-[11.5px] font-bold text-secondary-foreground">
                    {category.label}
                  </span>
                </div>
                <div className="text-[17px] font-extrabold tabular-nums">
                  {money(category.amount, data.currency)}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${category.sharePercent}%`,
                        background: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
                      }}
                    />
                  </div>
                  <span className="text-[11px] font-bold tabular-nums text-secondary-foreground">
                    {percent(category.sharePercent)}
                  </span>
                </div>
                <div className="mt-1 text-[10.5px] text-muted-foreground">
                  {count(category.count)} registros
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
