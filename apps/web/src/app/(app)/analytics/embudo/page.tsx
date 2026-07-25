import { Info } from "lucide-react";
import { AnalyticsFilters } from "@/components/analytics/analytics-filters";
import { AnalyticsHeader } from "@/components/analytics/analytics-header";
import {
  CardHeading,
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
  count,
  fetchAnalytics,
  fetchFilterOptions,
  money,
  number,
  percent,
  toneAscending,
} from "@/lib/analytics";

interface FunnelResponse extends AnalyticsEnvelope {
  totals: {
    openCount: number;
    openValue: number;
    openWithoutValueCount: number;
    wonCount: number;
    wonValue: number;
    lostCount: number;
    lostValue: number;
    winRate: number;
    avgCycleDays: number;
  };
  stages: { stage: string; label: string; count: number; value: number }[];
  quotes: {
    total: number;
    totalValue: number;
    byStatus: { status: string; label: string; count: number; value: number }[];
    convertedCount: number;
    conversionRate: number;
    avgDaysToOrder: number;
  };
  lostReasons: {
    reason: string;
    count: number;
    value: number;
    sharePercent: number;
    isOther: boolean;
  }[];
  breakdowns: {
    bySeller: {
      sellerId: string | null;
      sellerName: string;
      openCount: number;
      openValue: number;
      wonCount: number;
      wonValue: number;
      lostCount: number;
      winRate: number;
      avgCycleDays: number;
    }[];
  };
}

/** Las 6 etapas abiertas son el embudo; venta_cerrada y perdida son desenlaces. */
const CLOSED_STAGES = new Set(["venta_cerrada", "perdida"]);

const STAGE_COLORS = ["#0c2c44", "#134a6d", "#0f5c8a", "#1d7cb0", "#2ea3da", "#63bce3"];

const QUOTE_STATUS_COLORS: Record<string, string> = {
  abierta: "#0288c4",
  en_negociacion: "#ffcb06",
  cerrada: "#00a651",
  perdida: "#ee1c25",
};

const SELLER_COLUMNS = "minmax(150px,1.1fr) 70px 110px 70px 110px 130px 90px";

export default async function AnalyticsFunnelPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const [data, options] = await Promise.all([
    fetchAnalytics<FunnelResponse>("funnel", params),
    fetchFilterOptions(),
  ]);

  const description = "Cuánto hay en juego, dónde se traba y por qué se pierde.";

  if (!data) {
    return (
      <div className="grid gap-6">
        <AnalyticsHeader title="Embudo" description={description} screen="embudo" params={params} />
        <SectionCard>
          <NoData>No se pudo cargar la analítica del embudo.</NoData>
        </SectionCard>
      </div>
    );
  }

  const { totals, stages, quotes, lostReasons, breakdowns } = data;
  const openStages = stages.filter((stage) => !CLOSED_STAGES.has(stage.stage));
  const won = stages.find((stage) => stage.stage === "venta_cerrada");
  const lost = stages.find((stage) => stage.stage === "perdida");
  const stagePeak = Math.max(1, ...openStages.map((stage) => stage.count));
  const reasonPeak = Math.max(1, ...lostReasons.map((reason) => reason.count));

  return (
    <div className="grid gap-6">
      <AnalyticsHeader title="Embudo" description={description} screen="embudo" params={params} />

      <AnalyticsFilters
        options={options}
        currency={data.currency}
        applied={data.filters}
        mode="range"
        range={data.range}
        note={`Valores estimados en ${data.currency}`}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          brand
          label="En juego (abiertas)"
          value={money(totals.openValue, data.currency)}
          meta={
            <>
              {count(totals.openCount)} oportunidades ·{" "}
              <b className="text-[#9a6410]">
                {count(totals.openWithoutValueCount)} sin valor estimado
              </b>
            </>
          }
        />
        <Kpi
          dot
          tone="good"
          label="Ganadas"
          value={money(totals.wonValue, data.currency)}
          meta={`${count(totals.wonCount)} oportunidades`}
        />
        <Kpi
          dot
          tone={toneAscending(totals.winRate, 40, 60)}
          label="Tasa de cierre"
          value={percent(totals.winRate)}
          meta={`${count(totals.wonCount)} ganadas / ${count(totals.lostCount)} perdidas`}
        />
        <Kpi
          label="Ciclo promedio"
          value={`${number(totals.avgCycleDays)} días`}
          meta="creación → cierre"
        />
      </div>

      <div className="grid gap-3.5 xl:grid-cols-[1.3fr_1fr]">
        <SectionCard
          title="Etapas abiertas"
          description="Los desenlaces se muestran aparte — no son pasos del embudo."
        >
          {openStages.every((stage) => stage.count === 0) ? (
            <NoData>Sin oportunidades abiertas con estos filtros.</NoData>
          ) : (
            openStages.map((stage, index) => (
              <div key={stage.stage} className="mb-2.5 flex items-center gap-3">
                <span className="w-[132px] shrink-0 text-[12px] font-semibold text-secondary-foreground">
                  {stage.label}
                </span>
                <div className="h-[26px] flex-1 overflow-hidden rounded-[5px] bg-muted">
                  <div
                    className="flex h-full items-center rounded-[5px] px-2.5"
                    style={{
                      width: `${Math.max(stage.count === 0 ? 0 : 6, (stage.count / stagePeak) * 100)}%`,
                      background: STAGE_COLORS[index % STAGE_COLORS.length],
                    }}
                  >
                    <span className="text-[11.5px] font-extrabold text-white">
                      {count(stage.count)}
                    </span>
                  </div>
                </div>
                <span className="w-20 shrink-0 text-right text-[12px] font-bold tabular-nums">
                  {money(stage.value, data.currency)}
                </span>
              </div>
            ))
          )}

          <div className="mt-4 flex gap-3 border-t border-border/70 pt-3.5">
            <div className="flex-1 rounded-[9px] border border-[#c4e5d2] bg-[#e6f4ec] px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-[11.5px] font-bold text-[#167c4a]">
                <span aria-hidden="true" className="h-[7px] w-[7px] rounded-full bg-[#00a651]" />
                Venta cerrada
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-[19px] font-extrabold tabular-nums">
                  {count(won?.count ?? 0)}
                </span>
                <span className="text-[12px] font-semibold tabular-nums text-[#4e7a5f]">
                  {money(won?.value ?? 0, data.currency)}
                </span>
              </div>
            </div>
            <div className="flex-1 rounded-[9px] border border-[#f5c9c4] bg-[#fcebe9] px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-[11.5px] font-bold text-[#b42318]">
                <span aria-hidden="true" className="h-[7px] w-[7px] rounded-full bg-[#ee1c25]" />
                Perdida
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-[19px] font-extrabold tabular-nums">
                  {count(lost?.count ?? 0)}
                </span>
                <span className="text-[12px] font-semibold tabular-nums text-[#8a5550]">
                  {money(lost?.value ?? 0, data.currency)}
                </span>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Cotizaciones"
          description="La única conversión medida con un enlace real al pedido."
        >
          <div className="mb-3.5 flex items-center gap-3.5 rounded-[10px] border border-[#cfe0ea] bg-gradient-to-br from-[#e6f0f6] to-card px-4 py-3.5">
            <div className="flex-1">
              <div className="text-[12px] font-semibold text-[#3f6a86]">Conversión a pedido</div>
              <div className="mt-0.5 text-[26px] font-extrabold tracking-[-0.02em] tabular-nums text-primary">
                {percent(quotes.conversionRate)}
              </div>
              <div className="mt-0.5 text-[11px] text-[#6b8ea6]">
                {count(quotes.convertedCount)} de {count(quotes.total)} cotizaciones
              </div>
            </div>
            <div className="text-right">
              <div className="text-[12px] font-semibold text-[#3f6a86]">Días a pedido</div>
              <div className="mt-0.5 text-[19px] font-extrabold tabular-nums">
                {number(quotes.avgDaysToOrder)}
              </div>
            </div>
          </div>

          <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
            Por estado · {money(quotes.totalValue, data.currency)} en total
          </div>
          {quotes.byStatus.map((status) => (
            <div
              key={status.status}
              className="flex items-center gap-3 border-t border-border/60 py-2"
            >
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ background: QUOTE_STATUS_COLORS[status.status] ?? "#94a3b8" }}
              />
              <span className="flex-1 text-[12.5px] font-semibold text-secondary-foreground">
                {status.label}
              </span>
              <span className="rounded-[5px] bg-muted px-2 py-px text-[11.5px] font-bold tabular-nums text-secondary-foreground">
                {count(status.count)}
              </span>
              <span className="w-20 text-right text-[12px] font-bold tabular-nums">
                {money(status.value, data.currency)}
              </span>
            </div>
          ))}
        </SectionCard>
      </div>

      <div className="grid gap-3.5 xl:grid-cols-[1fr_1.3fr]">
        <SectionCard title="Motivos de pérdida">
          {/* `lostReason` es texto libre en la base: el back normaliza y agrupa,
              pero la lista puede traer cola larga. Se dice, no se disimula. */}
          <div className="mb-3.5 flex items-center gap-2 rounded-[7px] border border-[#f5dfb8] bg-[#fdf0dc] px-2.5 py-2 text-[11.5px] text-[#8a6520]">
            <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Texto libre agrupado por el back — normalizado, puede traer cola larga.
          </div>
          {lostReasons.length === 0 ? (
            <NoData>Ninguna oportunidad perdida registró motivo.</NoData>
          ) : (
            lostReasons.map((reason) => (
              <div key={reason.reason} className="mb-2.5 flex items-center gap-3">
                <span
                  className={`w-[104px] shrink-0 truncate text-[12px] font-semibold ${
                    reason.isOther ? "italic text-muted-foreground" : "text-secondary-foreground"
                  }`}
                >
                  {reason.reason}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${reason.isOther ? "bg-[#c2cbd6]" : "bg-[#ee1c25]"}`}
                    style={{ width: `${(reason.count / reasonPeak) * 100}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right text-[11.5px] font-bold tabular-nums">
                  {count(reason.count)}
                </span>
                <span className="w-16 shrink-0 text-right text-[11.5px] tabular-nums text-muted-foreground">
                  {money(reason.value, data.currency)}
                </span>
                <span className="w-12 shrink-0 text-right text-[11.5px] font-bold tabular-nums">
                  {percent(reason.sharePercent)}
                </span>
              </div>
            ))
          )}
        </SectionCard>

        <div className="overflow-hidden rounded-[11px] border border-border bg-card">
          <CardHeading title="Por vendedor" />
          {breakdowns.bySeller.length === 0 ? (
            <NoData />
          ) : (
            <DataGrid
              columns={SELLER_COLUMNS}
              header={
                <>
                  <div>Vendedor</div>
                  <div className="text-right">Abt.</div>
                  <div className="text-right">En juego</div>
                  <div className="text-right">Gan.</div>
                  <div className="text-right">Ganado</div>
                  <div>Cierre</div>
                  <div className="text-right">Ciclo</div>
                </>
              }
            >
              {breakdowns.bySeller.map((row, index) => (
                <GridRow
                  key={row.sellerId ?? row.sellerName}
                  columns={SELLER_COLUMNS}
                  zebra={index % 2 === 1}
                  height={50}
                >
                  <div className="truncate font-semibold">{row.sellerName}</div>
                  <div className="text-right tabular-nums text-muted-foreground">
                    {count(row.openCount)}
                  </div>
                  <div className="text-right font-semibold tabular-nums">
                    {money(row.openValue, data.currency)}
                  </div>
                  <div className="text-right font-bold tabular-nums text-[#167c4a]">
                    {count(row.wonCount)}
                  </div>
                  <div className="text-right font-bold tabular-nums">
                    {money(row.wonValue, data.currency)}
                  </div>
                  <MeterCell
                    percentValue={row.winRate}
                    label={percent(row.winRate)}
                    tone={toneAscending(row.winRate, 40, 60)}
                  />
                  <div className="text-right tabular-nums text-muted-foreground">
                    {number(row.avgCycleDays)} d
                  </div>
                </GridRow>
              ))}
            </DataGrid>
          )}
        </div>
      </div>
    </div>
  );
}
