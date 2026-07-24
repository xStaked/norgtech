"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchClient } from "@/lib/api.client";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Presentation } from "@/lib/catalog";

interface PresentationsCardProps {
  productId: string;
  presentations: Presentation[];
  canEdit: boolean;
}

const inputClasses =
  "h-[38px] w-full rounded-lg border border-input bg-card px-3 text-[12.5px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type Draft = { empaque: string; form: string; dosage: string };

const emptyDraft: Draft = { empaque: "", form: "", dosage: "" };

export function PresentationsCard({
  productId,
  presentations,
  canEdit,
}: PresentationsCardProps) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function startAdd() {
    setEditingId(null);
    setDraft(emptyDraft);
    setError(null);
    setAdding(true);
  }

  function startEdit(presentation: Presentation) {
    setAdding(false);
    setError(null);
    setEditingId(presentation.id);
    setDraft({
      empaque: presentation.empaque,
      form: presentation.form ?? "",
      dosage: presentation.dosage ?? "",
    });
  }

  function cancel() {
    setAdding(false);
    setEditingId(null);
    setDraft(emptyDraft);
    setError(null);
  }

  async function save() {
    if (!draft.empaque.trim()) {
      setError("El empaque es obligatorio.");
      return;
    }

    setSaving(true);
    setError(null);
    const body = {
      empaque: draft.empaque.trim(),
      form: draft.form.trim() || undefined,
      dosage: draft.dosage.trim() || undefined,
    };

    const response = await apiFetchClient(
      editingId ? `/product-presentations/${editingId}` : `/products/${productId}/presentations`,
      { method: editingId ? "PATCH" : "POST", body: JSON.stringify(body) },
    ).catch(() => null);

    setSaving(false);

    if (!response?.ok) {
      const data = await response?.json().catch(() => ({}));
      setError(data?.message ?? "No se pudo guardar la presentación.");
      return;
    }

    cancel();
    router.refresh();
  }

  /**
   * Desactivar, no borrar: los precios cuelgan de la presentación con
   * onDelete: Cascade, así que borrarla se llevaría su histórico de precios.
   */
  async function toggleActive(presentation: Presentation) {
    setSaving(true);
    setError(null);
    const response = await apiFetchClient(`/product-presentations/${presentation.id}`, {
      method: "PATCH",
      body: JSON.stringify({ active: !presentation.active }),
    }).catch(() => null);
    setSaving(false);

    if (!response?.ok) {
      setError("No se pudo cambiar el estado de la presentación.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="overflow-hidden rounded-[11px] border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-[#eef1f6] px-[18px] py-[13px]">
        <div className="text-[14.5px] font-extrabold text-foreground">
          Presentaciones{" "}
          <span className="text-xs font-semibold text-muted-foreground">
            · {presentations.length}
          </span>
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={startAdd}
            className="flex h-[30px] items-center gap-1.5 rounded-[7px] border border-dashed border-[#c2cbd6] bg-card px-3 text-xs font-bold text-[#0f5c8a] hover:bg-muted"
          >
            + Agregar presentación
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="border-b border-[#eef1f6] bg-[#fcebe9] px-[18px] py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <div className="hidden grid-cols-[1.3fr_1fr_1.4fr_100px_120px] gap-x-3 bg-[#fafbfc] px-[18px] py-2 text-[10.5px] font-bold tracking-[.05em] text-[#7a8696] uppercase sm:grid">
        <div>Empaque</div>
        <div>Forma</div>
        <div>Dosificación</div>
        <div>Estado</div>
        <div />
      </div>

      {presentations.length === 0 && !adding ? (
        <p className="px-[18px] py-6 text-center text-[13px] text-muted-foreground">
          Este producto no tiene presentaciones. Sin al menos una no se le puede poner precio.
        </p>
      ) : null}

      {presentations.map((presentation) =>
        editingId === presentation.id ? (
          <DraftRow
            key={presentation.id}
            draft={draft}
            setDraft={setDraft}
            onSave={save}
            onCancel={cancel}
            saving={saving}
          />
        ) : (
          <div
            key={presentation.id}
            className="grid grid-cols-1 items-center gap-x-3 gap-y-1 border-t border-[#f0f2f6] px-[18px] py-2.5 text-[12.5px] hover:bg-[#f9fbfd] sm:grid-cols-[1.3fr_1fr_1.4fr_100px_120px] sm:py-0 sm:h-11"
          >
            <div className="font-bold text-foreground">{presentation.empaque}</div>
            <div className="text-[#3a4658]">{presentation.form ?? "—"}</div>
            <div className="text-muted-foreground">{presentation.dosage ?? "—"}</div>
            <div>
              <StatusBadge tone={presentation.active ? "success" : "neutral"}>
                {presentation.active ? "Activa" : "Inactiva"}
              </StatusBadge>
            </div>
            <div className="flex justify-start gap-3 sm:justify-end">
              {canEdit ? (
                <>
                  <button
                    type="button"
                    onClick={() => startEdit(presentation)}
                    className="text-xs font-bold text-[#0f5c8a] hover:underline"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleActive(presentation)}
                    disabled={saving}
                    className="text-xs font-bold text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    {presentation.active ? "Desactivar" : "Activar"}
                  </button>
                </>
              ) : null}
            </div>
          </div>
        ),
      )}

      {adding ? (
        <DraftRow
          draft={draft}
          setDraft={setDraft}
          onSave={save}
          onCancel={cancel}
          saving={saving}
        />
      ) : null}
    </div>
  );
}

function DraftRow({
  draft,
  setDraft,
  onSave,
  onCancel,
  saving,
}: {
  draft: Draft;
  setDraft: (draft: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  return (
    <div className="grid grid-cols-1 items-center gap-2 border-t border-[#f0f2f6] bg-[#f9fbfd] px-[18px] py-3 sm:grid-cols-[1.3fr_1fr_1.4fr_100px_120px] sm:gap-x-3">
      <input
        autoFocus
        className={inputClasses}
        placeholder="Bolsa x 500 g"
        aria-label="Empaque"
        value={draft.empaque}
        onChange={(event) => setDraft({ ...draft, empaque: event.target.value })}
      />
      <input
        className={inputClasses}
        placeholder="Polvo soluble"
        aria-label="Forma"
        value={draft.form}
        onChange={(event) => setDraft({ ...draft, form: event.target.value })}
      />
      <input
        className={inputClasses}
        placeholder="500g/1.000 lt agua"
        aria-label="Dosificación"
        value={draft.dosage}
        onChange={(event) => setDraft({ ...draft, dosage: event.target.value })}
      />
      <div className="text-[11px] text-muted-foreground">Se guarda tal cual</div>
      <div className="flex gap-2 sm:justify-end">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="h-8 rounded-lg bg-[#0f5c8a] px-3 text-xs font-bold text-white disabled:opacity-50"
        >
          {saving ? "…" : "Guardar"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-8 rounded-lg border border-input bg-card px-3 text-xs font-bold text-foreground"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
