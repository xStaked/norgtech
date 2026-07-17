"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { crmTheme } from "@/components/ui/theme";
import { apiFetchClient } from "@/lib/api.client";

interface QuoteStatusControlProps {
  quoteId: string;
  currentStatus: string;
}

// Mirrors the QuoteStatus enum in prisma/schema.prisma. Moving a quote to
// "cerrada" is what unlocks the billing request (QUO-04).
const statusLabels: Record<string, string> = {
  abierta: "Abierta",
  en_negociacion: "En negociación",
  cerrada: "Cerrada",
  perdida: "Perdida",
};

const statusOrder = ["abierta", "en_negociacion", "cerrada", "perdida"] as const;

export function QuoteStatusControl({ quoteId, currentStatus }: QuoteStatusControlProps) {
  const router = useRouter();
  const [target, setTarget] = useState<string>(currentStatus);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleUpdate() {
    if (target === currentStatus) {
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const response = await apiFetchClient(`/quotes/${quoteId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: target }),
      });
      if (response.ok) {
        setMessage("Estado actualizado correctamente.");
        router.refresh();
      } else {
        const data = await response.json().catch(() => ({}));
        setMessage(data.message || "Error al actualizar el estado.");
      }
    } catch {
      setMessage("Error al actualizar el estado.");
    } finally {
      setLoading(false);
    }
  }

  const isError = Boolean(message?.includes("Error"));

  return (
    <div style={{ display: "grid", gap: 10, justifyItems: "start" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <select
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          disabled={loading}
          style={{
            minHeight: 44,
            padding: "0 12px",
            borderRadius: crmTheme.radius.md,
            border: `1px solid ${crmTheme.colors.border}`,
            background: crmTheme.colors.surface,
            color: crmTheme.colors.text,
            fontSize: 14,
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {statusOrder.map((status) => (
            <option key={status} value={status}>
              {statusLabels[status]}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={handleUpdate}
          disabled={loading || target === currentStatus}
          style={{
            minHeight: 44,
            padding: "0 16px",
            borderRadius: crmTheme.radius.md,
            border: 0,
            background: crmTheme.colors.primary,
            color: "#ffffff",
            fontSize: 14,
            fontWeight: 700,
            cursor: loading || target === currentStatus ? "not-allowed" : "pointer",
            opacity: loading || target === currentStatus ? 0.72 : 1,
            boxShadow: crmTheme.shadow.card,
          }}
        >
          {loading ? "Actualizando..." : "Actualizar estado"}
        </button>
      </div>

      {message ? (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: crmTheme.radius.md,
            background: isError ? "rgba(186, 58, 47, 0.08)" : "rgba(31, 143, 95, 0.08)",
            color: isError ? crmTheme.colors.danger : crmTheme.colors.success,
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {message}
        </div>
      ) : null}
    </div>
  );
}
