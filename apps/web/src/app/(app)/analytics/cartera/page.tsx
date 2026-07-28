import { CircleAlert } from "lucide-react";
import { AnalyticsFilters } from "@/components/analytics/analytics-filters";
import { AnalyticsHeader } from "@/components/analytics/analytics-header";
import {
  CardHeading,
  Chip,
  DataGrid,
  GridRow,
  Kpi,
  NoData,
} from "@/components/analytics/analytics-ui";
import { SectionCard } from "@/components/ui/section-card";
import {
  type AnalyticsEnvelope,
  type SearchParams,
  count,
  date,
  fetchAnalytics,
  fetchFilterOptions,
  money,
  number,
  param,
  percent,
  toneDescending,
} from "@/lib/analytics";
import { getCurrentUser } from "@/lib/auth.server";

interface ReceivablesResponse extends AnalyticsEnvelope {
  asOf: string;
  paymentBehaviorWindowDays: number;
  paymentBehaviorMinInvoices: number;
  totals: {
    outstandingTotal: number;
    overdueTotal: number;
    overduePercent: number;
    dso: number;
    invoiceCount: number;
    customerCount: number;
    customersOverCreditLimit: number;
  };
  aging: {
    bucket: string;
    label: string;
    amount: number;
    invoiceCount: number;
    customerCount: number;
    sharePercent: number;
  }[];
  breakdowns: {
    byCustomer: {
      customerId: string;
      customerName: string;
      sellerName: string;
      outstanding: number;
      overdue: number;
      oldestDueDate: string | null;
      maxDaysPastDue: number;
      creditLimit: number | null;
      creditUsagePercent: number | null;
      overLimit: boolean;
      paymentCondition: string | null;
    }[];
    byCustomerTruncated: boolean;
    byCustomerTotal: number;
    bySeller: {
      sellerId: string | null;
      sellerName: string;
      outstanding: number;
      overdue: number;
      overduePercent: number;
      customerCount: number;
    }[];
    paymentBehavior: {
      customerId: string;
      customerName: string;
      agreedDays: number;
      avgActualDays: number;
      deviationDays: number;
      invoicesPaid: number;
      onTimePercent: number;
    }[];
  };
}

/** Escala de gravedad del aging: de "todavia no vence" a "90+". */
const AGING_COLORS: Record<string, string> = {
  por_vencer: "bg-[#0288c4]",
  "1-30": "bg-[#a7ce39]",
  "31-60": "bg-[#ffcb06]",
  "61-90": "bg-[#f58221]",
  "90+": "bg-[#ee1c25]",
};

const PAYMENT_CONDITION_LABELS: Record<string, string> = {
  contado: "Contado",
  credito_15: "Crédito 15",
  credito_30: "Crédito 30",
  credito_60: "Crédito 60",
  credito_90: "Crédito 90",
};

const DEBTOR_COLUMNS = "minmax(180px,1.4fr) 120px 120px 110px 100px";

export default async function AnalyticsReceivablesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const [data, options, user] = await Promise.all([
    fetchAnalytics<ReceivablesResponse>("receivables", params),
    fetchFilterOptions(),
    getCurrentUser(),
  ]);
  // Un comercial tiene el vendedor forzado por el back (§2.4): el selector
  // se bloquea para que la barra no ofrezca un cambio que se ignora.
  const lockedSeller = user?.role === "comercial";

  const description =
    "Cuánta plata está en la calle, hace cuánto, de quién es y quién paga tarde.";

  if (!data) {
    return (
      <div className="grid gap-6">
        <AnalyticsHeader
          title="Cartera"
          description={description}
          screen="cartera"
          params={params}
        />
        <SectionCard>
          <NoData>No se pudo cargar la analítica de cartera.</NoData>
        </SectionCard>
      </div>
    );
  }

  const { totals, aging, breakdowns } = data;

  return (
    <div className="grid gap-6">
      <AnalyticsHeader
        title="Cartera"
        description={description}
        screen="cartera"
        params={params}
      />

      <AnalyticsFilters
        options={options}
        currency={data.currency}
        applied={data.filters}
        lockedSeller={lockedSeller}
        mode="asOf"
        range={data.range}
        asOf={data.asOf}
        note={`Foto a una fecha · comportamiento de pago: ${data.paymentBehaviorWindowDays} días previos`}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          brand
          label="Cartera total"
          value={money(totals.outstandingTotal, data.currency)}
          meta={`${count(totals.invoiceCount)} facturas · ${count(totals.customerCount)} clientes`}
        />
        <Kpi
          dot
          tone={toneDescending(totals.overduePercent, 15, 30)}
          label="Vencido"
          value={money(totals.overdueTotal, data.currency)}
          meta={`${percent(totals.overduePercent)} de la cartera`}
        />
        <Kpi
          dot
          tone="neutral"
          label="DSO"
          value={`${number(totals.dso)} días`}
          meta="cartera / facturación de 90 días"
        />
        <Kpi
          dot
          tone={totals.customersOverCreditLimit > 0 ? "bad" : "good"}
          label="Clientes sobre el cupo"
          value={count(totals.customersOverCreditLimit)}
          meta="saldo por encima del cupo aprobado"
        />
      </div>

      <SectionCard
        title="Antigüedad de saldos"
        description="El vencimiento se deriva de la fecha de vencimiento, no de la columna de estado."
        actions={
          <div className="text-right">
            <div className="text-[12px] text-muted-foreground">Vencido</div>
            <div className="text-[16px] font-extrabold tabular-nums text-[#b42318]">
              {money(totals.overdueTotal, data.currency)} · {percent(totals.overduePercent)}
            </div>
          </div>
        }
      >
        {totals.outstandingTotal === 0 ? (
          <NoData>Sin cartera pendiente a esta fecha.</NoData>
        ) : (
          <>
            <div className="mb-3.5 flex h-[34px] overflow-hidden rounded-lg">
              {aging
                .filter((bucket) => bucket.amount > 0)
                .map((bucket) => (
                  <div
                    key={bucket.bucket}
                    className={`flex items-center justify-center text-[11px] font-extrabold text-white ${AGING_COLORS[bucket.bucket]}`}
                    style={{ width: `${bucket.sharePercent}%` }}
                    title={`${bucket.label}: ${money(bucket.amount, data.currency)}`}
                  >
                    {bucket.sharePercent >= 8 ? percent(bucket.sharePercent) : ""}
                  </div>
                ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
              {aging.map((bucket) => (
                <div
                  key={bucket.bucket}
                  className="rounded-[9px] border border-border/70 bg-muted/40 px-3 py-2.5"
                >
                  <div className="mb-1 flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className={`h-2.5 w-2.5 shrink-0 rounded-sm ${AGING_COLORS[bucket.bucket]}`}
                    />
                    <span className="text-[11.5px] font-bold text-secondary-foreground">
                      {bucket.label}
                    </span>
                  </div>
                  <div className="text-[16px] font-extrabold tabular-nums">
                    {money(bucket.amount, data.currency)}
                  </div>
                  <div className="mt-0.5 text-[10.5px] text-muted-foreground">
                    {count(bucket.invoiceCount)} facturas · {count(bucket.customerCount)} clientes
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </SectionCard>

      <div className="grid gap-3.5 xl:grid-cols-[1.25fr_1fr]">
        <div className="overflow-hidden rounded-[11px] border border-border bg-card">
          <CardHeading
            title="Deudores"
            aside={
              breakdowns.byCustomerTruncated
                ? `Top ${breakdowns.byCustomer.length} de ${count(breakdowns.byCustomerTotal)} · el CSV trae todos`
                : `${count(breakdowns.byCustomer.length)} clientes`
            }
          />
          {breakdowns.byCustomer.length === 0 ? (
            <NoData />
          ) : (
            <DataGrid
              columns={DEBTOR_COLUMNS}
              header={
                <>
                  <div>Cliente</div>
                  <div className="text-right">Saldo</div>
                  <div className="text-right">Vencido</div>
                  <div className="text-center">Mora máx.</div>
                  <div className="text-right">Cupo</div>
                </>
              }
            >
              {breakdowns.byCustomer.map((row, index) => (
                <GridRow
                  key={row.customerId}
                  columns={DEBTOR_COLUMNS}
                  zebra={index % 2 === 1}
                  height={52}
                >
                  <div className="min-w-0 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-bold">{row.customerName}</span>
                      {row.overLimit ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-px text-[9.5px] font-extrabold text-[#b42318] bg-[#fcebe9]">
                          <CircleAlert className="h-3 w-3" aria-hidden="true" />
                          Sobre cupo
                        </span>
                      ) : null}
                    </div>
                    <div className="truncate text-[10.5px] text-muted-foreground">
                      {row.sellerName}
                      {row.paymentCondition
                        ? ` · ${PAYMENT_CONDITION_LABELS[row.paymentCondition] ?? row.paymentCondition}`
                        : ""}
                      {row.oldestDueDate ? ` · vence desde ${date(row.oldestDueDate)}` : ""}
                    </div>
                  </div>
                  <div className="text-right font-semibold tabular-nums">
                    {money(row.outstanding, data.currency)}
                  </div>
                  <div
                    className={`text-right font-bold tabular-nums ${row.overdue > 0 ? "text-[#b42318]" : "text-muted-foreground"}`}
                  >
                    {row.overdue > 0 ? money(row.overdue, data.currency) : "—"}
                  </div>
                  <div className="text-center">
                    {row.maxDaysPastDue > 0 ? (
                      <Chip tone={toneDescending(row.maxDaysPastDue, 30, 60)}>
                        {count(row.maxDaysPastDue)} d
                      </Chip>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">Al día</span>
                    )}
                  </div>
                  <div
                    className={`text-right font-bold tabular-nums ${row.overLimit ? "text-[#b42318]" : "text-muted-foreground"}`}
                  >
                    {row.creditUsagePercent === null ? "Sin cupo" : percent(row.creditUsagePercent)}
                  </div>
                </GridRow>
              ))}
            </DataGrid>
          )}
        </div>

        <div className="overflow-hidden rounded-[11px] border border-border bg-card">
          <CardHeading
            title="Comportamiento de pago"
            description={`Pactado vs real · mínimo ${data.paymentBehaviorMinInvoices} facturas pagadas en la ventana`}
          />
          {breakdowns.paymentBehavior.length === 0 ? (
            <NoData>
              Ningún cliente tiene {data.paymentBehaviorMinInvoices} o más facturas pagadas en los
              últimos {data.paymentBehaviorWindowDays} días.
            </NoData>
          ) : (
            <div>
              {breakdowns.paymentBehavior.map((row, index) => {
                const scale = Math.max(row.agreedDays, row.avgActualDays, 1);
                const tone = toneDescending(row.deviationDays, 5, 15);
                return (
                  <div
                    key={row.customerId}
                    className={`border-t border-border/60 px-[18px] py-3 ${index % 2 === 1 ? "bg-muted/30" : ""}`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="truncate text-[12.5px] font-bold">{row.customerName}</span>
                      <div className="flex shrink-0 items-center gap-2">
                        <Chip tone={tone}>
                          {row.deviationDays > 0 ? "+" : ""}
                          {number(row.deviationDays)} d
                        </Chip>
                        <span className="text-[11.5px] font-bold tabular-nums text-muted-foreground">
                          {percent(row.onTimePercent)} a tiempo
                        </span>
                      </div>
                    </div>
                    <div className="mb-1 flex items-center gap-2">
                      <span className="w-14 shrink-0 text-[10.5px] text-muted-foreground">
                        Pactado
                      </span>
                      <div className="h-[7px] flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-[#c2cbd6]"
                          style={{ width: `${(row.agreedDays / scale) * 100}%` }}
                        />
                      </div>
                      <span className="w-16 shrink-0 text-right text-[11px] font-semibold tabular-nums text-muted-foreground">
                        {count(row.agreedDays)} días
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-14 shrink-0 text-[10.5px] text-muted-foreground">Real</span>
                      <div className="h-[7px] flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${tone === "good" ? "bg-[#00a651]" : tone === "warn" ? "bg-[#f58221]" : "bg-[#ee1c25]"}`}
                          style={{ width: `${(row.avgActualDays / scale) * 100}%` }}
                        />
                      </div>
                      <span className="w-16 shrink-0 text-right text-[11px] font-bold tabular-nums">
                        {number(row.avgActualDays)} días
                      </span>
                    </div>
                    <div className="mt-1.5 text-[10.5px] text-muted-foreground/80">
                      {count(row.invoicesPaid)} facturas pagadas
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-[11px] border border-border bg-card">
        <CardHeading title="Cartera por vendedor" />
        {breakdowns.bySeller.length === 0 ? (
          <NoData />
        ) : (
          <DataGrid
            columns="minmax(160px,1fr) 140px 140px 120px 110px"
            header={
              <>
                <div>Vendedor</div>
                <div className="text-right">Saldo</div>
                <div className="text-right">Vencido</div>
                <div className="text-right">% vencido</div>
                <div className="text-right">Clientes</div>
              </>
            }
          >
            {breakdowns.bySeller.map((row, index) => (
              <GridRow
                key={row.sellerId ?? row.sellerName}
                columns="minmax(160px,1fr) 140px 140px 120px 110px"
                zebra={index % 2 === 1}
              >
                <div className="truncate font-semibold">{row.sellerName}</div>
                <div className="text-right font-semibold tabular-nums">
                  {money(row.outstanding, data.currency)}
                </div>
                <div className="text-right font-bold tabular-nums text-[#b42318]">
                  {money(row.overdue, data.currency)}
                </div>
                <div className="text-right">
                  <Chip tone={toneDescending(row.overduePercent, 15, 30)}>
                    {percent(row.overduePercent)}
                  </Chip>
                </div>
                <div className="text-right tabular-nums text-muted-foreground">
                  {count(row.customerCount)}
                </div>
              </GridRow>
            ))}
          </DataGrid>
        )}
      </div>
    </div>
  );
}
