"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Edit2, Save, Trash2, X } from "lucide-react";
import { apiFetchClient } from "@/lib/api.client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface SellerGoal {
  id: string;
  userId: string;
  periodType: string;
  periodValue: string;
  targetAmount: string | number;
  notes: string | null;
}

interface SellerGoalsManagerProps {
  userId: string;
  canManage: boolean;
}

interface GoalDraft {
  periodType: string;
  periodValue: string;
  targetAmount: string;
  notes: string;
}

const periodTypeOptions = [
  { value: "mensual", label: "Mensual" },
  { value: "trimestral", label: "Trimestral" },
  { value: "anual", label: "Anual" },
];

const selectClasses =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30";

function defaultPeriodValue() {
  return new Date().toISOString().slice(0, 7);
}

function periodPlaceholder(periodType: string) {
  if (periodType === "trimestral") return "2026-Q1";
  if (periodType === "anual") return "2026";
  return "2026-06";
}

function formatGoalAmount(value: string | number) {
  const amount = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(amount)) return "-";

  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatPeriodLabel(goal: Pick<SellerGoal, "periodType" | "periodValue">) {
  const label = periodTypeOptions.find((option) => option.value === goal.periodType)?.label ?? goal.periodType;
  return `${goal.periodValue} (${label})`;
}

function normalizePeriodValue(value: string) {
  return value.trim().toUpperCase();
}

async function readErrorMessage(response: Response, fallback: string) {
  const data = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
  if (Array.isArray(data?.message)) return data.message.join(". ");
  return data?.message ?? fallback;
}

function toDraft(goal: SellerGoal): GoalDraft {
  return {
    periodType: goal.periodType,
    periodValue: goal.periodValue,
    targetAmount: String(goal.targetAmount),
    notes: goal.notes ?? "",
  };
}

export function SellerGoalsManager({ userId, canManage }: SellerGoalsManagerProps) {
  const [goals, setGoals] = useState<SellerGoal[]>([]);
  const [periodType, setPeriodType] = useState("mensual");
  const [periodValue, setPeriodValue] = useState(defaultPeriodValue);
  const [targetAmount, setTargetAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<GoalDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadGoals = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiFetchClient(`/users/${userId}/seller-goals`);
      if (!response.ok) {
        setError(await readErrorMessage(response, "No se pudieron cargar las metas"));
        return;
      }

      const data = (await response.json()) as SellerGoal[];
      setGoals(data);
    } catch {
      setError("Error de conexion al cargar metas");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadGoals();
  }, [loadGoals]);

  async function createGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || saving) return;

    setSaving(true);
    setError(null);

    try {
      const response = await apiFetchClient(`/users/${userId}/seller-goals`, {
        method: "POST",
        body: JSON.stringify({
          periodType,
          periodValue: normalizePeriodValue(periodValue),
          targetAmount: Number(targetAmount),
          notes: notes.trim() || undefined,
        }),
      });

      if (!response.ok) {
        setError(await readErrorMessage(response, "No se pudo crear la meta"));
        return;
      }

      setPeriodType("mensual");
      setPeriodValue(defaultPeriodValue());
      setTargetAmount("");
      setNotes("");
      await loadGoals();
    } catch {
      setError("Error de conexion al crear la meta");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(goal: SellerGoal) {
    setEditingGoalId(goal.id);
    setEditDraft(toDraft(goal));
    setError(null);
  }

  function cancelEdit() {
    setEditingGoalId(null);
    setEditDraft(null);
  }

  async function saveEdit(goalId: string) {
    if (!canManage || !editDraft || saving) return;

    setSaving(true);
    setError(null);

    try {
      const response = await apiFetchClient(`/users/${userId}/seller-goals/${goalId}`, {
        method: "PATCH",
        body: JSON.stringify({
          periodType: editDraft.periodType,
          periodValue: normalizePeriodValue(editDraft.periodValue),
          targetAmount: Number(editDraft.targetAmount),
          notes: editDraft.notes.trim() || null,
        }),
      });

      if (!response.ok) {
        setError(await readErrorMessage(response, "No se pudo actualizar la meta"));
        return;
      }

      cancelEdit();
      await loadGoals();
    } catch {
      setError("Error de conexion al actualizar la meta");
    } finally {
      setSaving(false);
    }
  }

  async function deleteGoal(goalId: string) {
    if (!canManage || saving) return;
    if (!window.confirm("Eliminar esta meta comercial?")) return;

    setSaving(true);
    setError(null);

    try {
      const response = await apiFetchClient(`/users/${userId}/seller-goals/${goalId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        setError(await readErrorMessage(response, "No se pudo eliminar la meta"));
        return;
      }

      if (editingGoalId === goalId) cancelEdit();
      setGoals((current) => current.filter((goal) => goal.id !== goalId));
    } catch {
      setError("Error de conexion al eliminar la meta");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-foreground">Metas comerciales</div>
          <p className="text-xs text-muted-foreground">Objetivos por periodo para este vendedor.</p>
        </div>
        {loading ? <span className="text-xs text-muted-foreground">Cargando...</span> : null}
      </div>

      {canManage ? (
        <form onSubmit={createGoal} className="mb-3 grid gap-2 lg:grid-cols-[140px_130px_minmax(140px,1fr)_minmax(180px,1.2fr)_auto]">
          <div className="grid gap-1">
            <Label className="sr-only" htmlFor={`seller-goal-period-type-${userId}`}>
              Tipo de periodo
            </Label>
            <select
              id={`seller-goal-period-type-${userId}`}
              className={selectClasses}
              value={periodType}
              onChange={(event) => {
                setPeriodType(event.target.value);
                setPeriodValue(event.target.value === "mensual" ? defaultPeriodValue() : "");
              }}
            >
              {periodTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <Input
            value={periodValue}
            onChange={(event) => setPeriodValue(event.target.value.toUpperCase())}
            placeholder={periodPlaceholder(periodType)}
            aria-label="Periodo de la meta"
            required
          />
          <Input
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={targetAmount}
            onChange={(event) => setTargetAmount(event.target.value)}
            placeholder="Meta COP"
            aria-label="Monto de la meta"
            required
          />
          <Input
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Notas"
            aria-label="Notas de la meta"
          />
          <Button type="submit" size="sm" disabled={saving || !targetAmount.trim() || !periodValue.trim()}>
            Crear
          </Button>
        </form>
      ) : null}

      {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}

      {!loading && goals.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin metas registradas.</p>
      ) : null}

      {goals.length > 0 ? (
        <div className="grid gap-2">
          {goals.map((goal) => {
            const isEditing = editingGoalId === goal.id && editDraft;

            return (
              <div key={goal.id} className="rounded-md border border-border/60 bg-background p-3">
                {isEditing ? (
                  <div className="grid gap-2 lg:grid-cols-[140px_130px_minmax(140px,1fr)_minmax(180px,1.2fr)_auto]">
                    <select
                      className={selectClasses}
                      value={editDraft.periodType}
                      onChange={(event) =>
                        setEditDraft((current) =>
                          current ? { ...current, periodType: event.target.value, periodValue: "" } : current,
                        )
                      }
                      aria-label="Tipo de periodo"
                    >
                      {periodTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <Input
                      value={editDraft.periodValue}
                      onChange={(event) =>
                        setEditDraft((current) =>
                          current ? { ...current, periodValue: event.target.value.toUpperCase() } : current,
                        )
                      }
                      placeholder={periodPlaceholder(editDraft.periodType)}
                      aria-label="Periodo"
                    />
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      value={editDraft.targetAmount}
                      onChange={(event) =>
                        setEditDraft((current) =>
                          current ? { ...current, targetAmount: event.target.value } : current,
                        )
                      }
                      aria-label="Monto"
                    />
                    <Textarea
                      rows={1}
                      value={editDraft.notes}
                      onChange={(event) =>
                        setEditDraft((current) =>
                          current ? { ...current, notes: event.target.value } : current,
                        )
                      }
                      placeholder="Notas"
                      aria-label="Notas"
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="icon"
                        onClick={() => void saveEdit(goal.id)}
                        disabled={saving || !editDraft.targetAmount.trim() || !editDraft.periodValue.trim()}
                        aria-label="Guardar meta"
                      >
                        <Save className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="outline" size="icon" onClick={cancelEdit} aria-label="Cancelar edicion">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground">{formatPeriodLabel(goal)}</div>
                      <div className="text-sm text-muted-foreground">{formatGoalAmount(goal.targetAmount)}</div>
                      {goal.notes ? <p className="mt-1 text-xs text-muted-foreground">{goal.notes}</p> : null}
                    </div>
                    {canManage ? (
                      <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" size="icon" onClick={() => startEdit(goal)} aria-label="Editar meta">
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => void deleteGoal(goal.id)}
                          disabled={saving}
                          aria-label="Eliminar meta"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
