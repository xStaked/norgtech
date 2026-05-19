"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetchClient } from "@/lib/api.client";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { ArrowRight } from "lucide-react";

interface Customer {
  id: string;
  displayName: string;
  segment?: { name: string } | null;
}

interface GoalProgress {
  customerId: string;
  periodType: string;
  periodValue: string;
  targetAmount: string | number;
  soldAmount: string | number;
  percentage: number;
  remainingAmount: string | number;
  ordersCount: number;
}

interface CustomerWithProgress extends Customer {
  progress: GoalProgress | null;
}

function formatMillions(value: string | number): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return `$${(num / 1_000_000).toFixed(1)}M`;
}

function ProgressBar({ percentage, size = "md" }: { percentage: number; size?: "sm" | "md" }) {
  const colorClass =
    percentage >= 80
      ? "bg-emerald-500"
      : percentage >= 50
        ? "bg-amber-500"
        : "bg-red-500";

  const heightClass = size === "sm" ? "h-1.5" : "h-2.5";

  return (
    <div className={cn("w-full rounded-full bg-muted", heightClass)}>
      <div
        className={cn("rounded-full transition-all", heightClass, colorClass)}
        style={{ width: `${Math.min(percentage, 100)}%` }}
      />
    </div>
  );
}

function GoalStatusBadge({ percentage }: { percentage: number }) {
  if (percentage >= 100) {
    return <StatusBadge tone="success">✅ Cumplida</StatusBadge>;
  }
  if (percentage >= 80) {
    return <StatusBadge tone="warning">🔥 Cerca</StatusBadge>;
  }
  return <StatusBadge tone="danger">⚠️ Estancado</StatusBadge>;
}

export function CustomerGoalsDashboard() {
  const [customersWithProgress, setCustomersWithProgress] = useState<CustomerWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        const customersRes = await apiFetchClient("/customers");
        if (!customersRes.ok) {
          throw new Error("Error al cargar los clientes");
        }

        const allCustomers: Customer[] = await customersRes.json();
        const limitedCustomers = allCustomers.slice(0, 20);

        const progressResults = await Promise.all(
          limitedCustomers.map(async (customer) => {
            try {
              const res = await apiFetchClient(`/customers/${customer.id}/goal-progress`);
              if (res.ok) {
                const progress: GoalProgress = await res.json();
                return { ...customer, progress };
              }
              return { ...customer, progress: null };
            } catch {
              return { ...customer, progress: null };
            }
          })
        );

        if (cancelled) return;

        const withGoals = progressResults.filter((item) => item.progress !== null);
        withGoals.sort((a, b) => (b.progress?.percentage ?? 0) - (a.progress?.percentage ?? 0));

        setCustomersWithProgress(withGoals);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Error desconocido");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  const goalsProgress = customersWithProgress
    .map((c) => c.progress)
    .filter((p): p is GoalProgress => p !== null);

  const totalTarget = goalsProgress.reduce((sum, g) => sum + (Number(g?.targetAmount) ?? 0), 0);
  const totalSold = goalsProgress.reduce((sum, g) => sum + (Number(g?.soldAmount) ?? 0), 0);
  const overallPercentage = totalTarget > 0 ? (totalSold / totalTarget) * 100 : 0;

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-bold">Metas Comerciales</CardTitle>
            <CardDescription>
              Progreso de metas de los clientes asignados.
            </CardDescription>
          </div>
          <Link
            href="/customers"
            className="inline-flex h-7 items-center justify-center gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] font-medium whitespace-nowrap transition-all hover:bg-muted hover:text-foreground"
          >
            Ver todos
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="flex items-center justify-center py-10">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        )}

        {!loading && error && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {!loading && !error && customersWithProgress.length === 0 && (
          <div className="py-6 text-sm text-muted-foreground">
            No hay clientes con metas asignadas en este período.
          </div>
        )}

        {!loading && !error && customersWithProgress.length > 0 && (
          <div className="space-y-6">
            {/* Resumen general */}
            <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-medium text-muted-foreground">
                  Progreso general del comercial
                </div>
                <div className="text-sm font-semibold">
                  {overallPercentage.toFixed(1)}%
                </div>
              </div>
              <ProgressBar percentage={overallPercentage} />
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="text-center">
                  <div className="text-xl font-bold">{formatMillions(totalTarget)}</div>
                  <div className="text-xs text-muted-foreground">Meta total</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold">{formatMillions(totalSold)}</div>
                  <div className="text-xs text-muted-foreground">Vendido total</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold">{overallPercentage.toFixed(1)}%</div>
                  <div className="text-xs text-muted-foreground">% general</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold">{goalsProgress.length}</div>
                  <div className="text-xs text-muted-foreground">Clientes con meta</div>
                </div>
              </div>
            </div>

            {/* Lista de clientes */}
            <div className="space-y-3">
              {customersWithProgress.map((customer) => {
                const progress = customer.progress!;
                return (
                  <div
                    key={customer.id}
                    className="flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-sm font-semibold">
                          {customer.displayName}
                        </div>
                        <GoalStatusBadge percentage={progress.percentage} />
                      </div>
                      {customer.segment?.name && (
                        <div className="text-xs text-muted-foreground">
                          {customer.segment.name}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-4 sm:gap-6">
                      <div className="text-right">
                        <div className="text-sm font-semibold">{formatMillions(progress.targetAmount)}</div>
                        <div className="text-[0.65rem] text-muted-foreground">Meta</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold">{formatMillions(progress.soldAmount)}</div>
                        <div className="text-[0.65rem] text-muted-foreground">Vendido</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold">{progress.percentage.toFixed(0)}%</div>
                        <div className="text-[0.65rem] text-muted-foreground">Cumplido</div>
                      </div>
                      <div className="hidden w-24 sm:block">
                        <ProgressBar percentage={progress.percentage} size="sm" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
