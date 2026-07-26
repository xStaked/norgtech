"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Info, Plus, Target, Trash2, X } from "lucide-react";
import { apiFetchClient } from "@/lib/api.client";
import { ROLE_LABELS } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { type ManagedUser } from "@/components/users/types";
import { formatCop, goalBarColor } from "@/components/users/user-format";
import { readErrorMessage } from "@/components/users/user-mutations";

interface SellerGoal {
  id: string;
  userId: string;
  periodType: string;
  periodValue: string;
  targetAmount: string | number;
  notes: string | null;
}

interface GoalProgress {
  soldAmount: number;
  percentage: number;
}

interface GoalDraft {
  periodType: string;
  periodValue: string;
  targetAmount: string;
  notes: string;
}

interface SellerGoalsDrawerProps {
  user: ManagedUser | null;
  onOpenChange: (open: boolean) => void;
}

const periodTypeOptions = [
  { value: "mensual", label: "Mensual" },
  { value: "trimestral", label: "Trimestral" },
  { value: "anual", label: "Anual" },
];

/**
 * Mes actual en Bogota, `YYYY-MM`.
 *
 * `toISOString()` da el mes en UTC: a las 19:00 de Bogota del ultimo dia del
 * mes ya es el mes siguiente, asi que el formulario se prellenaba con un mes
 * que aun no empieza y la meta nacia fuera del periodo que muestra el panel
 * (GOAL-01). Misma zona que usa la API para su periodo por defecto.
 */
function defaultPeriodValue() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

function periodPlaceholder(periodType: string) {
  if (periodType === "trimestral") return "2026-Q1";
  if (periodType === "anual") return "2026";
  return "2026-06";
}

function periodTypeLabel(periodType: string) {
  return periodTypeOptions.find((option) => option.value === periodType)?.label ?? periodType;
}

function normalizePeriodValue(value: string) {
  return value.trim().toUpperCase();
}

function emptyDraft(): GoalDraft {
  return {
    periodType: "mensual",
    periodValue: defaultPeriodValue(),
    targetAmount: "",
    notes: "",
  };
}

function toDraft(goal: SellerGoal): GoalDraft {
  return {
    periodType: goal.periodType,
    periodValue: goal.periodValue,
    targetAmount: String(goal.targetAmount),
    notes: goal.notes ?? "",
  };
}

export function SellerGoalsDrawer({ user, onOpenChange }: SellerGoalsDrawerProps) {
  const userId = user?.id ?? null;
  const [goals, setGoals] = useState<SellerGoal[]>([]);
  const [progress, setProgress] = useState<Record<string, GoalProgress>>({});
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [draft, setDraft] = useState<GoalDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadGoals = useCallback(async () => {
    if (!userId) return;

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

      // El avance es por periodo, asi que no hay un endpoint que los traiga
      // todos: una consulta por meta, en paralelo. Si alguna falla, la tarjeta
      // se muestra sin barra en vez de tumbar el panel.
      const entries = await Promise.all(
        data.map(async (goal) => {
          const query = new URLSearchParams({
            periodType: goal.periodType,
            periodValue: goal.periodValue,
          });
          const res = await apiFetchClient(
            `/users/${userId}/seller-goals/progress?${query.toString()}`,
          ).catch(() => null);
          if (!res?.ok) return null;
          const item = (await res.json()) as GoalProgress;
          return [goal.id, { soldAmount: item.soldAmount, percentage: item.percentage }] as const;
        }),
      );

      setProgress(Object.fromEntries(entries.filter((entry) => entry !== null)));
    } catch {
      setError("Error de conexión al cargar metas");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    setGoals([]);
    setProgress({});
    setEditingGoalId(null);
    setDraft(null);
    setNotice(null);
    void loadGoals();
  }, [loadGoals]);

  async function submitDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId || !draft || saving) return;

    setSaving(true);
    setError(null);
    setNotice(null);

    const periodValue = normalizePeriodValue(draft.periodValue);
    const isEdit = editingGoalId !== null;

    try {
      const response = await apiFetchClient(
        isEdit
          ? `/users/${userId}/seller-goals/${editingGoalId}`
          : `/users/${userId}/seller-goals`,
        {
          method: isEdit ? "PATCH" : "POST",
          body: JSON.stringify({
            periodType: draft.periodType,
            periodValue,
            targetAmount: Number(draft.targetAmount),
            notes: draft.notes.trim() || (isEdit ? null : undefined),
          }),
        },
      );

      if (!response.ok) {
        setError(
          await readErrorMessage(
            response,
            isEdit ? "No se pudo actualizar la meta" : "No se pudo crear la meta",
          ),
        );
        return;
      }

      // GOAL-01: el panel del dashboard muestra por defecto el mes actual. Una
      // meta anual, trimestral o de otro mes se crea BIEN pero no aparece ahi,
      // y sin este aviso el usuario concluye que no se guardo.
      if (!isEdit && (draft.periodType !== "mensual" || periodValue !== defaultPeriodValue())) {
        setNotice(
          `Meta creada para ${periodValue}. El panel "Metas por vendedor" del dashboard muestra el mes actual (${defaultPeriodValue()}) por defecto: selecciona allí ese periodo para verla.`,
        );
      }

      setEditingGoalId(null);
      setDraft(null);
      await loadGoals();
    } catch {
      setError("Error de conexión al guardar la meta");
    } finally {
      setSaving(false);
    }
  }

  async function deleteGoal(goalId: string) {
    if (!userId || saving) return;
    if (!window.confirm("¿Eliminar esta meta comercial?")) return;

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

      if (editingGoalId === goalId) {
        setEditingGoalId(null);
        setDraft(null);
      }
      setGoals((current) => current.filter((goal) => goal.id !== goalId));
    } catch {
      setError("Error de conexión al eliminar la meta");
    } finally {
      setSaving(false);
    }
  }

  const isCreating = draft !== null && editingGoalId === null;

  return (
    <Sheet open={user !== null} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="gap-0 p-0 sm:max-w-[480px]"
      >
        <div className="flex items-center gap-3 border-b border-[#eef1f6] p-5">
          <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] bg-[#0f5c8a] text-white">
            <Target className="h-[17px] w-[17px]" />
          </span>
          <div className="min-w-0 flex-1">
            <SheetTitle className="text-base font-extrabold text-foreground">
              Metas de venta
            </SheetTitle>
            <SheetDescription className="text-xs">
              {user ? `${user.name} · ${ROLE_LABELS[user.role] ?? user.role}` : ""}
            </SheetDescription>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={() => onOpenChange(false)} aria-label="Cerrar">
            <X />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error ? (
            <p className="mb-3 rounded-lg border border-[#f5c9c4] bg-[#fcebe9] px-3 py-2 text-[12.5px] font-semibold text-[#b42318]">
              {error}
            </p>
          ) : null}

          {notice ? (
            <p className="mb-3 rounded-lg border border-[#bcdcf0] bg-[#e4f1f9] px-3 py-2 text-xs text-[#3f6a86]">
              {notice}
            </p>
          ) : null}

          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando metas…</p>
          ) : null}

          {!loading && goals.length === 0 && !isCreating ? (
            <p className="mb-3 text-sm text-muted-foreground">
              Este vendedor todavía no tiene metas registradas.
            </p>
          ) : null}

          {goals.map((goal) => {
            const isEditing = editingGoalId === goal.id && draft !== null;
            const target = Number(goal.targetAmount);
            const advance = progress[goal.id];
            const percentage = advance?.percentage ?? 0;
            const barWidth = Math.min(100, percentage);

            if (isEditing) {
              return (
                <GoalForm
                  key={goal.id}
                  draft={draft}
                  setDraft={setDraft}
                  saving={saving}
                  submitLabel="Guardar meta"
                  onSubmit={submitDraft}
                  onCancel={() => {
                    setEditingGoalId(null);
                    setDraft(null);
                  }}
                />
              );
            }

            return (
              <div key={goal.id} className="mb-3 rounded-[11px] border border-border p-4">
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-[#e6f0f6] px-2 py-0.5 text-[11px] font-bold text-[#0f5c8a]">
                      {periodTypeLabel(goal.periodType)}
                    </span>
                    <span className="text-[13px] font-bold tabular-nums text-foreground">
                      {goal.periodValue}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      className="text-xs font-bold text-[#0f5c8a] hover:underline"
                      onClick={() => {
                        setEditingGoalId(goal.id);
                        setDraft(toDraft(goal));
                        setError(null);
                      }}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="text-[#b42318] disabled:opacity-50"
                      disabled={saving}
                      onClick={() => void deleteGoal(goal.id)}
                      aria-label={`Eliminar meta ${goal.periodValue}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="mb-1.5 flex items-baseline justify-between text-xs text-muted-foreground">
                  <span>
                    Avance{" "}
                    <b className="tabular-nums text-foreground">
                      {advance ? formatCop(advance.soldAmount) : "—"}
                    </b>
                  </span>
                  <span>
                    Meta <b className="tabular-nums text-foreground">{formatCop(target)}</b>
                  </span>
                </div>

                <div className="mb-1.5 h-2 overflow-hidden rounded-full bg-[#eef1f6]">
                  <div
                    className="h-full rounded-full transition-[width]"
                    style={{ width: `${barWidth}%`, background: goalBarColor(percentage) }}
                  />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-[12.5px] font-extrabold tabular-nums text-foreground">
                    {advance ? `${percentage}% cumplido` : "Avance no disponible"}
                  </span>
                  {goal.notes ? (
                    <span className="truncate text-[11px] text-muted-foreground">{goal.notes}</span>
                  ) : null}
                </div>
              </div>
            );
          })}

          {isCreating && draft ? (
            <GoalForm
              draft={draft}
              setDraft={setDraft}
              saving={saving}
              submitLabel="Crear meta"
              onSubmit={submitDraft}
              onCancel={() => setDraft(null)}
            />
          ) : (
            <button
              type="button"
              className="flex h-[38px] w-full items-center justify-center gap-1.5 rounded-[9px] border border-dashed border-[#c2cbd6] text-[12.5px] font-bold text-[#0f5c8a] hover:bg-muted/40"
              onClick={() => {
                setEditingGoalId(null);
                setDraft(emptyDraft());
                setError(null);
              }}
            >
              <Plus className="h-4 w-4" />
              Agregar meta
            </button>
          )}

          <p className="mt-3 flex items-start gap-1.5 text-[11.5px] text-muted-foreground">
            <Info className="mt-px h-3.5 w-3.5 shrink-0" />
            Una meta por combinación de periodo. El avance se calcula con las ventas facturadas del
            periodo.
          </p>
        </div>

        <div className="flex justify-end border-t border-[#eef1f6] p-4">
          <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface GoalFormProps {
  draft: GoalDraft;
  setDraft: (updater: (current: GoalDraft | null) => GoalDraft | null) => void;
  saving: boolean;
  submitLabel: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}

function GoalForm({ draft, setDraft, saving, submitLabel, onSubmit, onCancel }: GoalFormProps) {
  const patch = (values: Partial<GoalDraft>) =>
    setDraft((current) => (current ? { ...current, ...values } : current));

  return (
    <form
      onSubmit={onSubmit}
      className="mb-3 grid gap-3 rounded-[11px] border border-[#bcdcf0] bg-[#f6fbfe] p-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label className="text-xs font-semibold text-[#3a4658]">Periodo</Label>
          <Select
            value={draft.periodType}
            onValueChange={(value) => patch({ periodType: value || "mensual", periodValue: "" })}
            options={periodTypeOptions}
          />
        </div>

        <div className="grid gap-1.5">
          <Label className="text-xs font-semibold text-[#3a4658]">Valor</Label>
          <Input
            value={draft.periodValue}
            onChange={(event) => patch({ periodValue: event.target.value.toUpperCase() })}
            placeholder={periodPlaceholder(draft.periodType)}
            aria-label="Periodo de la meta"
            required
          />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label className="text-xs font-semibold text-[#3a4658]">Meta (COP)</Label>
        <Input
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          value={draft.targetAmount}
          onChange={(event) => patch({ targetAmount: event.target.value })}
          aria-label="Monto de la meta"
          required
        />
      </div>

      <div className="grid gap-1.5">
        <Label className="text-xs font-semibold text-[#3a4658]">Notas</Label>
        <Textarea
          rows={2}
          value={draft.notes}
          onChange={(event) => patch({ notes: event.target.value })}
          aria-label="Notas de la meta"
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={saving || !draft.targetAmount.trim() || !draft.periodValue.trim()}
        >
          {saving ? "Guardando…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
