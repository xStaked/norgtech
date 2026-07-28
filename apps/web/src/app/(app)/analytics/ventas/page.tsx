import Link from "next/link";
import { TrendingDown, TrendingUp, TriangleAlert } from "lucide-react";
import { AnalyticsFilters } from "@/components/analytics/analytics-filters";
import { AnalyticsHeader } from "@/components/analytics/analytics-header";
import {
  DataGrid,
  GridRow,
  Kpi,
  MeterCell,
  NoData,
} from "@/components/analytics/analytics-ui";
import { SectionCard } from "@/components/ui/section-card";
import {
  type AnalyticsEnvelope,
  type SearchParams,
  bucketLabel,
  count,
  date,
  fetchAnalytics,
  fetchFilterOptions,
  money,
  number,
  param,
  percent,
  signedPercent,
  toneDescending,
} from "@/lib/analytics";
import { getCurrentUser } from "@/lib/auth.server";

interface SalesResponse extends AnalyticsEnvelope {
  totals: {
    grossRevenue: number;
    returnsTotal: number;
    netRevenue: number;
    orderCount: number;
    customerCount: number;
    unitCount: number;
    avgTicket: number;
    avgDiscountPercent: number;
    discountAmount: number;
  };
  previous: {
    label: string;
    from: string;
    to: string;
    netRevenue: number;
    orderCount: number;
    changePercent: number;
  };
  series: {
    bucket: string;
    grossRevenue: number;
    netRevenue: number;
    orderCount: number;
    avgTicket: number;
    previousNetRevenue: number | null;
  }[];
  breakdowns: {
    bySeller: Row[];
    byCustomer: (Row & { customerName: string; lastOrderDate: string | null })[];
    byCustomerTruncated: boolean;
    byCustomerTotal: number;
    byProduct: {
      sku: string;
      name: string;
      presentation: string | null;
      quantity: number;
      revenue: number;
      orderCount: number;
      sharePercent: number;
    }[];
    byProductTruncated: boolean;
    byProductTotal: number;
    byZone: (Row & { zoneName: string })[];
    bySegment: (Row & { segmentName: string })[];
    byCompany: (Row & { companyName: string; prefix: string | null })[];
    byCity: (Row & { city: string; department: string | null })[];
    discountLeaks: {
      sellerId: string | null;
      sellerName: string;
      avgDiscountPercent: number;
      discountAmount: number;
      orderCount: number;
      worstCustomerName: string | null;
    }[];
    discountLeaksTruncated: boolean;
  };
}

interface Row {
  name: string;
  netRevenue: number;
  orderCount: number;
  customerCount: number;
  sharePercent: number;
}

const TABS = [
  { key: "cliente", label: "Cliente" },
  { key: "vendedor", label: "Vendedor" },
  { key: "producto", label: "Producto" },
  { key: "zona", label: "Zona" },
  { key: "segmento", label: "Segmento" },
  { key: "empresa", label: "Empresa" },
  { key: "ciudad", label: "Ciudad" },
];

const GENERIC_COLUMNS = "minmax(160px,1fr) 170px 110px 150px";
const CUSTOMER_COLUMNS = "minmax(160px,1fr) 170px 110px 130px 150px";
const PRODUCT_COLUMNS = "minmax(180px,1fr) 130px 150px 110px 150px";
const LEAK_COLUMNS = "minmax(150px,1fr) 140px 150px 110px minmax(120px,1fr)";

export default async function AnalyticsSalesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const [data, options, user] = await Promise.all([
    fetchAnalytics<SalesResponse>("sales", params),
    fetchFilterOptions(),
    getCurrentUser(),
  ]);
  // Un comercial tiene el vendedor forzado por el back (§2.4): el selector
  // se bloquea para que la barra no ofrezca un cambio que se ignora.
  const lockedSeller = user?.role === "comercial";

  if (!data) {
    return (
      <div className="grid gap-6">
        <AnalyticsHeader
          title="Ventas"
          description="Cuánto vendimos, a quién, de qué — y cuánto se va en descuentos."
          screen="ventas"
          params={params}
        />
        <SectionCard>
          <NoData>No se pudo cargar la analítica de ventas.</NoData>
        </SectionCard>
      </div>
    );
  }

  const { totals, previous, series, breakdowns } = data;
  const activeTab = param(params, "tab") ?? "cliente";
  const up = previous.changePercent >= 0;

  // Escala compartida por las barras del periodo y la linea del año anterior:
  // con escalas distintas la comparacion visual seria mentira.
  const peak = Math.max(
    1,
    ...series.map((point) => Math.max(point.netRevenue, point.previousNetRevenue ?? 0)),
  );

  return (
    <div className="grid gap-6">
      <AnalyticsHeader
        title="Ventas"
        description="Cuánto vendimos, a quién, de qué — y cuánto se va en descuentos."
        screen="ventas"
        params={params}
      />

      <AnalyticsFilters
        options={options}
        currency={data.currency}
        applied={data.filters}
        lockedSeller={lockedSeller}
        mode="range"
        range={data.range}
        note={`Cifras en ${data.currency} · nunca se suman monedas distintas`}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi
          brand
          label="Venta neta"
          value={money(totals.netRevenue, data.currency)}
          meta={
            <span className="flex items-center gap-1.5">
              <span
                className={`inline-flex items-center gap-1 text-[12px] font-bold ${
                  up ? "text-[#167c4a]" : "text-[#b42318]"
                }`}
              >
                {up ? (
                  <TrendingUp className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <TrendingDown className="h-3 w-3" aria-hidden="true" />
                )}
                {signedPercent(previous.changePercent)}
              </span>
              vs año anterior
            </span>
          }
        />
        <Kpi
          label="Pedidos"
          value={count(totals.orderCount)}
          meta={`${count(previous.orderCount)} el año anterior`}
        />
        <Kpi
          label="Ticket promedio"
          value={money(totals.avgTicket, data.currency)}
          meta="bruto / pedidos"
        />
        <Kpi
          label="Clientes que compraron"
          value={count(totals.customerCount)}
          meta={`${number(totals.unitCount)} unidades`}
        />
        <Kpi
          label="Descuento promedio"
          value={percent(totals.avgDiscountPercent)}
          meta={`${money(totals.discountAmount, data.currency)} concedidos`}
        />
      </div>

      <SectionCard
        title={`Venta neta por ${data.range.granularity === "month" ? "mes" : data.range.granularity === "week" ? "semana" : "día"}`}
        description={`Bruto ${money(totals.grossRevenue, data.currency)} · devoluciones −${money(
          totals.returnsTotal,
          data.currency,
        )} · ${data.currency}`}
        actions={
          <div className="flex gap-4 text-[11.5px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-3.5 rounded-sm bg-primary" aria-hidden="true" />
              Periodo actual
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="h-0 w-4 border-t-2 border-dashed border-[#f58221]"
                aria-hidden="true"
              />
              Año anterior
            </span>
          </div>
        }
      >
        {series.length === 0 ? (
          <NoData />
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[520px]">
              <div className="flex h-[190px] items-end gap-3">
                {series.map((point) => (
                  <div key={point.bucket} className="relative flex h-full flex-1 flex-col justify-end">
                    {point.previousNetRevenue === null ? null : (
                      <div
                        aria-hidden="true"
                        className="absolute inset-x-0 z-10 h-0 border-t-2 border-dashed border-[#f58221]"
                        style={{
                          bottom: `${Math.max(0, (point.previousNetRevenue / peak) * 100)}%`,
                        }}
                      />
                    )}
                    <div
                      className="rounded-t bg-primary"
                      style={{ height: `${Math.max(0, (point.netRevenue / peak) * 100)}%` }}
                      title={`${bucketLabel(point.bucket, data.range.granularity)}: ${money(point.netRevenue, data.currency)}`}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-3">
                {series.map((point) => (
                  <div key={point.bucket} className="flex-1 text-center">
                    <div className="text-[11px] font-semibold text-muted-foreground">
                      {bucketLabel(point.bucket, data.range.granularity)}
                    </div>
                    <div className="text-[10.5px] tabular-nums text-muted-foreground/70">
                      {money(point.netRevenue, data.currency)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </SectionCard>

      {/* La fuga por descuento es el hallazgo de esta pantalla, no una tabla mas:
          por eso rompe el patron visual del resto. */}
      {breakdowns.discountLeaks.length > 0 ? (
        <div className="overflow-hidden rounded-[11px] border border-[#f5dfb8] bg-card">
          <div className="flex items-center gap-3 border-b border-[#f5dfb8] bg-gradient-to-r from-[#fdf0dc] to-card px-[18px] py-3">
            <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-[#f58221] text-white">
              <TriangleAlert className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <div className="text-[14px] font-extrabold">Fuga por descuento</div>
              <div className="text-[12px] text-[#8a6520]">
                {money(totals.discountAmount, data.currency)} concedidos en el período ·{" "}
                {percent(totals.avgDiscountPercent)} promedio
              </div>
            </div>
          </div>
          <DataGrid
            columns={LEAK_COLUMNS}
            header={
              <>
                <div>Vendedor</div>
                <div className="text-right">Desc. promedio</div>
                <div className="text-right">Monto</div>
                <div className="text-right">Pedidos</div>
                <div>Peor cliente</div>
              </>
            }
          >
            {breakdowns.discountLeaks.map((leak, index) => {
              const tone = toneDescending(leak.avgDiscountPercent, 7, 10);
              return (
                <GridRow key={leak.sellerId ?? leak.sellerName} columns={LEAK_COLUMNS} zebra={index % 2 === 1}>
                  <div className="truncate font-semibold">{leak.sellerName}</div>
                  <div>
                    <MeterCell
                      percentValue={leak.avgDiscountPercent}
                      label={percent(leak.avgDiscountPercent)}
                      tone={tone}
                      width={12}
                    />
                  </div>
                  <div className="text-right font-bold tabular-nums">
                    {money(leak.discountAmount, data.currency)}
                  </div>
                  <div className="text-right tabular-nums text-muted-foreground">
                    {count(leak.orderCount)}
                  </div>
                  <div className="truncate text-secondary-foreground">
                    {leak.worstCustomerName ?? "—"}
                  </div>
                </GridRow>
              );
            })}
          </DataGrid>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-[11px] border border-border bg-card">
        <div className="flex flex-wrap items-center gap-0.5 border-b border-border/70 px-[18px] pt-2.5">
          {TABS.map((tab) => {
            const query = new URLSearchParams(
              Object.entries(params).flatMap(([key, value]) =>
                value && key !== "tab" ? [[key, Array.isArray(value) ? value[0] : value] as [string, string]] : [],
              ),
            );
            query.set("tab", tab.key);
            return (
              <Link
                key={tab.key}
                href={`/analytics/ventas?${query.toString()}`}
                className={`px-3 pb-2.5 pt-2 text-[12.5px] ${
                  activeTab === tab.key
                    ? "font-bold text-foreground shadow-[inset_0_-2px_0_var(--primary)]"
                    : "font-medium text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
          {activeTab === "cliente" && breakdowns.byCustomerTruncated ? (
            <span className="ml-auto pb-2.5 text-[11.5px] text-muted-foreground">
              Mostrando {breakdowns.byCustomer.length} de {count(breakdowns.byCustomerTotal)} · el
              CSV trae todos
            </span>
          ) : null}
          {activeTab === "producto" && breakdowns.byProductTruncated ? (
            <span className="ml-auto pb-2.5 text-[11.5px] text-muted-foreground">
              Mostrando {breakdowns.byProduct.length} de {count(breakdowns.byProductTotal)} · el CSV
              trae todos
            </span>
          ) : null}
        </div>

        {activeTab === "producto" ? (
          <ProductTable rows={breakdowns.byProduct} currency={data.currency} />
        ) : activeTab === "cliente" ? (
          <CustomerTable rows={breakdowns.byCustomer} currency={data.currency} />
        ) : (
          <GenericTable
            label={
              TABS.find((tab) => tab.key === activeTab)?.label ?? "Cliente"
            }
            rows={
              activeTab === "vendedor"
                ? breakdowns.bySeller
                : activeTab === "zona"
                  ? breakdowns.byZone
                  : activeTab === "segmento"
                    ? breakdowns.bySegment
                    : activeTab === "empresa"
                      ? breakdowns.byCompany
                      : breakdowns.byCity
            }
            currency={data.currency}
          />
        )}
      </div>
    </div>
  );
}

function ShareCell({ value }: { value: number }) {
  return <MeterCell percentValue={value} label={percent(value)} tone="neutral" />;
}

function CustomerTable({
  rows,
  currency,
}: {
  rows: (Row & { customerName: string; lastOrderDate: string | null })[];
  currency: string;
}) {
  if (rows.length === 0) return <NoData />;
  return (
    <DataGrid
      columns={CUSTOMER_COLUMNS}
      header={
        <>
          <div>Cliente</div>
          <div className="text-right">Venta neta</div>
          <div className="text-right">Pedidos</div>
          <div>Última compra</div>
          <div>Participación</div>
        </>
      }
    >
      {rows.map((row, index) => (
        <GridRow key={row.customerName + index} columns={CUSTOMER_COLUMNS} zebra={index % 2 === 1}>
          <div className="truncate font-semibold">{row.customerName}</div>
          <div className="text-right font-bold tabular-nums">{money(row.netRevenue, currency)}</div>
          <div className="text-right tabular-nums text-muted-foreground">{count(row.orderCount)}</div>
          <div className="tabular-nums text-muted-foreground">{date(row.lastOrderDate)}</div>
          <ShareCell value={row.sharePercent} />
        </GridRow>
      ))}
    </DataGrid>
  );
}

function ProductTable({
  rows,
  currency,
}: {
  rows: SalesResponse["breakdowns"]["byProduct"];
  currency: string;
}) {
  if (rows.length === 0) return <NoData />;
  return (
    <DataGrid
      columns={PRODUCT_COLUMNS}
      header={
        <>
          <div>Producto</div>
          <div className="text-right">Unidades</div>
          <div className="text-right">Venta</div>
          <div className="text-right">Pedidos</div>
          <div>Participación</div>
        </>
      }
    >
      {rows.map((row, index) => (
        <GridRow key={`${row.sku}-${row.presentation ?? ""}`} columns={PRODUCT_COLUMNS} zebra={index % 2 === 1}>
          <div className="min-w-0">
            <div className="truncate font-semibold">{row.name}</div>
            <div className="truncate text-[10.5px] text-muted-foreground">
              {row.sku}
              {row.presentation ? ` · ${row.presentation}` : ""}
            </div>
          </div>
          <div className="text-right tabular-nums text-muted-foreground">{number(row.quantity)}</div>
          <div className="text-right font-bold tabular-nums">{money(row.revenue, currency)}</div>
          <div className="text-right tabular-nums text-muted-foreground">{count(row.orderCount)}</div>
          <ShareCell value={row.sharePercent} />
        </GridRow>
      ))}
    </DataGrid>
  );
}

function GenericTable({
  label,
  rows,
  currency,
}: {
  label: string;
  rows: Row[];
  currency: string;
}) {
  if (rows.length === 0) return <NoData />;
  return (
    <DataGrid
      columns={GENERIC_COLUMNS}
      header={
        <>
          <div>{label}</div>
          <div className="text-right">Venta neta</div>
          <div className="text-right">Pedidos</div>
          <div>Participación</div>
        </>
      }
    >
      {rows.map((row, index) => (
        <GridRow key={`${row.name}-${index}`} columns={GENERIC_COLUMNS} zebra={index % 2 === 1}>
          <div className="truncate font-semibold">{row.name}</div>
          <div className="text-right font-bold tabular-nums">{money(row.netRevenue, currency)}</div>
          <div className="text-right tabular-nums text-muted-foreground">{count(row.orderCount)}</div>
          <ShareCell value={row.sharePercent} />
        </GridRow>
      ))}
    </DataGrid>
  );
}
