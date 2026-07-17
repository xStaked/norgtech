import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import { CalendarRange, Target, TrendingUp, WalletCards } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

interface SellerGoalTotals {
  targetAmount: number;
  soldAmount: number;
  percentage: number;
  remainingAmount: number;
  sellers: number;
}

export interface SellerGoalItem {
  userId: string;
  sellerName: string;
  targetAmount: number;
  soldAmount: number;
  percentage: number;
  remainingAmount: number;
  ordersCount: number;
  customersCount: number;
}

export interface SellerGoalPeriod {
  periodType: string;
  periodValue: string;
  goals: number;
}

export interface SellerGoalsSummary {
  periodType: string;
  periodValue: string;
  /** El periodo no lo eligió el usuario: la API cayó al mes actual. */
  periodIsDefault: boolean;
  /** Todos los periodos que tienen metas, no solo el mostrado (GOAL-01). */
  availablePeriods: SellerGoalPeriod[];
  companyId: string | null;
  totals: SellerGoalTotals;
  items: SellerGoalItem[];
}

interface SellerGoalsDashboardProps {
  summary: SellerGoalsSummary | null;
  companyId?: string;
}

const currencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("es-CO", {
  maximumFractionDigits: 1,
});

function formatCurrency(value: number) {
  return currencyFormatter.format(Math.round(value));
}

function formatPercentage(value: number) {
  return `${numberFormatter.format(value)}%`;
}

const MONTH_NAMES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function periodLabel(periodType: string, periodValue: string) {
  if (periodType === "mensual") {
    const [year, month] = periodValue.split("-");
    const name = MONTH_NAMES[Number(month) - 1];
    if (!name) return periodValue;
    return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
  }
  if (periodType === "trimestral") return `Trimestre ${periodValue.replace("-", " ")}`;
  if (periodType === "anual") return `Año ${periodValue}`;
  return periodValue;
}

function periodHref(
  period: { periodType: string; periodValue: string },
  companyId?: string,
) {
  const params = new URLSearchParams();
  if (companyId) params.set("companyId", companyId);
  params.set("goalPeriodType", period.periodType);
  params.set("goalPeriodValue", period.periodValue);
  return `/dashboard?${params}`;
}

function badgeForPercentage(percentage: number) {
  if (percentage >= 100) return { tone: "success" as const, label: "Cumplida" };
  if (percentage >= 80) return { tone: "warning" as const, label: "Cerca" };
  return { tone: "danger" as const, label: "En curso" };
}

function ProgressBar({ percentage }: { percentage: number }) {
  const width = Math.min(Math.max(percentage, 0), 100);
  const barClass =
    percentage >= 100
      ? "bg-emerald-500"
      : percentage >= 80
        ? "bg-amber-500"
        : "bg-blue-500";

  return (
    <div className="h-2 w-full rounded-full bg-muted">
      <div
        className={cn("h-2 rounded-full transition-all", barClass)}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-3">
      <div className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold">{value}</div>
    </div>
  );
}

function Th({ children, align = "left" }: { children: ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className={cn(
        "px-3 py-2 text-xs font-semibold uppercase tracking-normal text-muted-foreground",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  className,
}: {
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td
      className={cn(
        "px-3 py-3 text-sm",
        align === "right" ? "text-right tabular-nums" : "text-left",
        className,
      )}
    >
      {children}
    </td>
  );
}

export function SellerGoalsDashboard({ summary, companyId }: SellerGoalsDashboardProps) {
  if (!summary) return null;

  const totals = summary.totals;
  const remaining = Math.max(0, totals.remainingAmount);
  const activeLabel = periodLabel(summary.periodType, summary.periodValue);
  const periods = summary.availablePeriods ?? [];
  // Periodos que existen pero no se estan viendo: son exactamente las metas que
  // el usuario cree perdidas cuando no las encuentra aqui (GOAL-01).
  const otherPeriods = periods.filter(
    (period) =>
      period.periodType !== summary.periodType ||
      period.periodValue !== summary.periodValue,
  );

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="text-lg font-bold">Metas por vendedor · {activeLabel}</CardTitle>
            <CardDescription>
              Avance comercial por vendedor para {activeLabel}
              {summary.periodIsDefault ? " (periodo actual, por defecto)" : ""}. Solo se muestran las
              metas de este periodo.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Target className="h-4 w-4" />
            {totals.sellers.toLocaleString("es-CO")} vendedores
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {periods.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <CalendarRange className="h-3.5 w-3.5" />
              Periodo:
            </span>
            {periods.map((period) => {
              const isActive =
                period.periodType === summary.periodType &&
                period.periodValue === summary.periodValue;
              return (
                <Link
                  key={`${period.periodType}-${period.periodValue}`}
                  href={periodHref(period, companyId)}
                  aria-current={isActive ? "true" : undefined}
                  className={cn(
                    "rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors",
                    isActive
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-muted",
                  )}
                >
                  {periodLabel(period.periodType, period.periodValue)} ({period.goals})
                </Link>
              );
            })}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Meta total" value={formatCurrency(totals.targetAmount)} />
          <Metric label="Vendido" value={formatCurrency(totals.soldAmount)} />
          <Metric label="Cumplimiento" value={formatPercentage(totals.percentage)} />
          <Metric label="Restante" value={formatCurrency(remaining)} />
        </div>

        {summary.items.length === 0 ? (
          <div className="rounded-lg border border-border/60 bg-background/30 p-5 text-sm text-muted-foreground">
            <p>No hay metas de vendedores para {activeLabel}.</p>
            {otherPeriods.length > 0 ? (
              <p className="mt-1">
                Sí hay metas en{" "}
                {otherPeriods.map((period, index) => (
                  <span key={`${period.periodType}-${period.periodValue}`}>
                    {index > 0 ? ", " : ""}
                    <Link
                      href={periodHref(period, companyId)}
                      className="font-semibold text-foreground underline underline-offset-2"
                    >
                      {periodLabel(period.periodType, period.periodValue)}
                    </Link>
                  </span>
                ))}
                .
              </p>
            ) : null}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border/60">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse">
                <thead className="bg-muted/30">
                  <tr>
                    <Th>Vendedor</Th>
                    <Th align="right">Meta</Th>
                    <Th align="right">Vendido</Th>
                    <Th align="right">%</Th>
                    <Th align="right">Restante</Th>
                    <Th align="right">Pedidos</Th>
                    <Th align="right">Clientes</Th>
                    <Th>Avance</Th>
                  </tr>
                </thead>
                <tbody>
                  {summary.items.map((item) => {
                    const badge = badgeForPercentage(item.percentage);
                    return (
                      <tr key={item.userId} className="border-t border-border/60">
                        <Td className="min-w-[180px] font-medium">
                          <div className="flex min-w-0 flex-col gap-1">
                            <span className="truncate">{item.sellerName || "Sin nombre"}</span>
                            <span className="sm:hidden">
                              <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
                            </span>
                          </div>
                        </Td>
                        <Td align="right">{formatCurrency(item.targetAmount)}</Td>
                        <Td align="right">{formatCurrency(item.soldAmount)}</Td>
                        <Td align="right" className="font-semibold">
                          {formatPercentage(item.percentage)}
                        </Td>
                        <Td align="right">{formatCurrency(item.remainingAmount)}</Td>
                        <Td align="right">{item.ordersCount.toLocaleString("es-CO")}</Td>
                        <Td align="right">{item.customersCount.toLocaleString("es-CO")}</Td>
                        <Td className="min-w-[170px]">
                          <div className="flex items-center gap-3">
                            <ProgressBar percentage={item.percentage} />
                            <span className="hidden shrink-0 sm:inline-flex">
                              <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
                            </span>
                          </div>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span className="inline-flex items-center gap-2">
            <TrendingUp className="h-3.5 w-3.5" />
            El avance usa pedidos facturados, despachados, en transito y entregados.
          </span>
          <span className="inline-flex items-center gap-2">
            <WalletCards className="h-3.5 w-3.5" />
            Restante: {formatCurrency(remaining)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
