"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetchClient } from "@/lib/api.client";
import { formatPercent } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";

interface Goal {
  id: string;
  periodType: string;
  periodValue: string;
  targetAmount: string | number;
  notes: string | null;
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

function formatMillions(value: string | number): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return `$${(num / 1_000_000).toFixed(1)}M`;
}

function formatPeriodLabel(periodType: string, periodValue: string): string {
  const typeLabels: Record<string, string> = {
    anual: "Anual",
    trimestral: "Trimestral",
    mensual: "Mensual",
  };
  const label = typeLabels[periodType.toLowerCase()] ?? periodType;
  return `${periodValue} (${label})`;
}

function periodPlaceholder(periodType: string): string {
  switch (periodType.toLowerCase()) {
    case "trimestral":
      return "2025-Q1";
    case "mensual":
      return "2025-03";
    default:
      return "2025";
  }
}

function ProgressBar({ percentage }: { percentage: number }) {
  const colorClass =
    percentage >= 80
      ? "bg-emerald-500"
      : percentage >= 50
        ? "bg-amber-500"
        : "bg-red-500";

  return (
    <div className="w-full rounded-full bg-muted h-2.5">
      <div
        className={cn("h-2.5 rounded-full transition-all", colorClass)}
        style={{ width: `${Math.min(percentage, 100)}%` }}
      />
    </div>
  );
}

interface CustomerGoalsSectionProps {
  customerId: string;
}

export function CustomerGoalsSection({
  customerId,
}: CustomerGoalsSectionProps) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [progress, setProgress] = useState<GoalProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [periodType, setPeriodType] = useState("anual");
  const [periodValue, setPeriodValue] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [notes, setNotes] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [goalsRes, progressRes] = await Promise.all([
        apiFetchClient(`/customers/${customerId}/goals`),
        apiFetchClient(`/customers/${customerId}/goal-progress`),
      ]);

      if (!goalsRes.ok) {
        throw new Error("Error al cargar las metas");
      }

      const goalsData: Goal[] = await goalsRes.json();
      setGoals(goalsData);

      if (progressRes.ok) {
        const progressData: GoalProgress = await progressRes.json();
        setProgress(progressData);
      } else if (progressRes.status === 404) {
        setProgress(null);
      } else {
        throw new Error("Error al cargar el progreso");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!periodValue.trim() || !targetAmount.trim()) return;

    setCreating(true);
    try {
      const response = await apiFetchClient(`/customers/${customerId}/goals`, {
        method: "POST",
        body: JSON.stringify({
          periodType,
          periodValue: periodValue.trim(),
          targetAmount: Number(targetAmount),
          notes: notes.trim() || null,
        }),
      });

      if (!response.ok) {
        throw new Error("Error al crear la meta");
      }

      setPeriodType("anual");
      setPeriodValue("");
      setTargetAmount("");
      setNotes("");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear la meta");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(goalId: string) {
    if (!window.confirm("¿Estás seguro de que deseas eliminar esta meta?"))
      return;

    try {
      const response = await apiFetchClient(
        `/customers/${customerId}/goals/${goalId}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        throw new Error("Error al eliminar la meta");
      }

      await loadData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al eliminar la meta"
      );
    }
  }

  return (
    <div id="metas-comerciales">
      <SectionCard
        title="Metas Comerciales"
        description="Gestiona las metas de ventas y su progreso"
      >
      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      )}

      {!loading && error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="grid gap-6">
          {/* Progreso de meta activa */}
          {progress && (
            <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-medium text-muted-foreground">
                  Progreso: {formatPeriodLabel(progress.periodType, progress.periodValue)}
                </div>
                <div className="text-sm font-semibold">
                  {formatPercent(progress.percentage)}
                </div>
              </div>
              <ProgressBar percentage={progress.percentage} />
              <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
                <div className="text-center">
                  <div className="text-xl font-bold">
                    {formatMillions(progress.targetAmount)}
                  </div>
                  <div className="text-xs text-muted-foreground">Meta</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold">
                    {formatMillions(progress.soldAmount)}
                  </div>
                  <div className="text-xs text-muted-foreground">Vendido</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold">
                    {formatPercent(progress.percentage)}
                  </div>
                  <div className="text-xs text-muted-foreground">% Cumplido</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold">
                    {formatMillions(progress.remainingAmount)}
                  </div>
                  <div className="text-xs text-muted-foreground">Faltante</div>
                </div>
              </div>
            </div>
          )}

          {/* Lista de metas */}
          {goals.length === 0 ? (
            <EmptyState
              title="No hay metas asignadas para este cliente."
              description="Crea una meta comercial para comenzar a hacer seguimiento de las ventas."
            />
          ) : (
            <div className="grid gap-3">
              {goals.map((goal) => (
                <div
                  key={goal.id}
                  className="flex items-start justify-between gap-4 rounded-lg border border-border/60 bg-muted/20 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">
                      {formatPeriodLabel(goal.periodType, goal.periodValue)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Meta: {formatMillions(goal.targetAmount)}
                    </div>
                    {goal.notes && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {goal.notes}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(goal.id)}
                  >
                    Eliminar
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Formulario para crear meta */}
          <form onSubmit={handleCreate} className="grid gap-4">
            <div className="text-sm font-semibold">Nueva meta</div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="periodType">Tipo de período</Label>
                <Select
                  id="periodType"
                  value={periodType}
                  onValueChange={(value) => {
                    if (value) {
                      setPeriodType(value);
                      setPeriodValue("");
                    }
                  }}
                  placeholder="Selecciona..."
                  options={[
                    { value: "anual", label: "Anual" },
                    { value: "trimestral", label: "Trimestral" },
                    { value: "mensual", label: "Mensual" },
                  ]}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="periodValue">Período</Label>
                <Input
                  id="periodValue"
                  placeholder={periodPlaceholder(periodType)}
                  value={periodValue}
                  onChange={(e) => setPeriodValue(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="targetAmount">Meta ($)</Label>
                <Input
                  id="targetAmount"
                  type="number"
                  min={0}
                  step={1}
                  placeholder="120000000"
                  value={targetAmount}
                  onChange={(e) => setTargetAmount(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="notes">Notas (opcional)</Label>
              <Textarea
                id="notes"
                placeholder="Notas adicionales sobre la meta..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <div>
              <Button type="submit" disabled={creating}>
                {creating ? "Creando..." : "Crear meta"}
              </Button>
            </div>
          </form>
        </div>
      )}
      </SectionCard>
    </div>
  );
}
