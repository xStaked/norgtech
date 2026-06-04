"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, FileCheck, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetchClient } from "@/lib/api.client";

interface ExpenseStatusActionProps {
  id: string;
  currentStatus: string;
  canChange: boolean;
}

const nextActions: Record<string, Array<{ status: string; label: string; variant: "default" | "secondary" | "destructive"; icon: "check" | "file" | "back" | "x"; needsNote?: boolean }>> = {
  pendiente: [
    { status: "aprobado", label: "Aprobar", variant: "default", icon: "check" },
    { status: "requiere_correccion", label: "Pedir correccion", variant: "secondary", icon: "back", needsNote: true },
    { status: "rechazado", label: "Rechazar", variant: "destructive", icon: "x", needsNote: true },
  ],
  aprobado: [
    { status: "contabilizado", label: "Marcar contabilizado", variant: "secondary", icon: "file" },
  ],
};

function ActionIcon({ name }: { name: "check" | "file" | "back" | "x" }) {
  if (name === "file") return <FileCheck aria-hidden="true" />;
  if (name === "back") return <RotateCcw aria-hidden="true" />;
  if (name === "x") return <X aria-hidden="true" />;
  return <Check aria-hidden="true" />;
}

function getErrorMessage(data: unknown) {
  if (typeof data === "object" && data && "message" in data) {
    const message = (data as { message?: unknown }).message;
    if (Array.isArray(message)) return message.join(", ");
    if (typeof message === "string") return message;
  }
  return "Error al actualizar el estado";
}

export function ExpenseStatusAction({ id, currentStatus, canChange }: ExpenseStatusActionProps) {
  const router = useRouter();
  const [reviewNote, setReviewNote] = useState("");
  const [loadingStatus, setLoadingStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const actions = canChange ? nextActions[currentStatus] ?? [] : [];
  const requiresNote = actions.some((action) => action.needsNote);

  async function changeStatus(status: string, needsNote?: boolean) {
    setError(null);

    if (needsNote && !reviewNote.trim()) {
      setError("Agrega una nota de revision.");
      return;
    }

    setLoadingStatus(status);
    try {
      const response = await apiFetchClient(`/commercial-expenses/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          reviewNote: reviewNote.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(getErrorMessage(data));
        return;
      }

      router.refresh();
    } catch {
      setError("Error de conexion");
    } finally {
      setLoadingStatus(null);
    }
  }

  if (!actions.length) return null;

  return (
    <div className="grid gap-3">
      {requiresNote ? (
        <div className="grid gap-1">
          <Label>Nota de revision</Label>
          <Textarea
            value={reviewNote}
            onChange={(event) => setReviewNote(event.target.value)}
            rows={3}
            placeholder="Motivo para correccion o rechazo"
          />
        </div>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex flex-wrap gap-3">
        {actions.map((action) => (
          <Button
            key={action.status}
            type="button"
            variant={action.variant}
            disabled={loadingStatus !== null}
            onClick={() => void changeStatus(action.status, action.needsNote)}
          >
            <ActionIcon name={action.icon} />
            {loadingStatus === action.status ? "Procesando..." : action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
