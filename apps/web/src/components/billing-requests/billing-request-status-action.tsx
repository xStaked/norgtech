"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchClient } from "@/lib/api.client";
import { StatusBadge } from "@/components/ui/status-badge";
import type { CrmStatusTone } from "@/components/ui/theme";

const statusLabels: Record<string, string> = {
  pendiente: "Pendiente",
  procesada: "Procesada",
  rechazada: "Rechazada",
};

const statusTones: Record<string, CrmStatusTone> = {
  pendiente: "warning",
  procesada: "success",
  rechazada: "danger",
};

interface BillingRequestStatusActionProps {
  id: string;
  currentStatus: string;
  canChange: boolean;
}

export function BillingRequestStatusAction({ id, currentStatus, canChange }: BillingRequestStatusActionProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function changeStatus(newStatus: string) {
    setError(null);
    setLoading(true);
    try {
      const response = await apiFetchClient(`/billing-requests/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.message || "Error al cambiar estado");
        setLoading(false);
        return;
      }
      router.refresh();
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <StatusBadge tone={statusTones[currentStatus] ?? "neutral"}>
          {statusLabels[currentStatus] ?? currentStatus}
        </StatusBadge>
        {canChange && currentStatus === "pendiente" && (
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => changeStatus("procesada")}
              disabled={loading}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "none",
                backgroundColor: "#1f8f5f",
                color: "#fff",
                fontSize: 12,
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
              }}
            >
              Procesar
            </button>
            <button
              onClick={() => changeStatus("rechazada")}
              disabled={loading}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "none",
                backgroundColor: "#ba3a2f",
                color: "#fff",
                fontSize: 12,
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
              }}
            >
              Rechazar
            </button>
          </div>
        )}
      </div>
      {error && <span style={{ color: "#ba3a2f", fontSize: 12 }}>{error}</span>}
    </div>
  );
}
