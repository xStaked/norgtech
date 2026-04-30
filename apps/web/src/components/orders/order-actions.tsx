"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchClient } from "@/lib/api.client";
import { getSessionTokenClient, getUserRoleFromToken } from "@/lib/auth";

interface OrderActionsProps {
  orderId: string;
  currentStatus: string;
}

const statusLabels: Record<string, string> = {
  recibido: "Recibido",
  orden_facturacion: "Orden de facturación",
  facturado: "Facturado",
  despachado: "Despachado",
  entregado: "Entregado",
};

const nextStatusMap: Record<string, string> = {
  recibido: "orden_facturacion",
  orden_facturacion: "facturado",
  facturado: "despachado",
  despachado: "entregado",
};

const advanceRoles = ["administrador", "director_comercial", "comercial", "logistica"];
const billRoles = ["administrador", "director_comercial", "facturacion"];

export function OrderActions({ orderId, currentStatus }: OrderActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token = getSessionTokenClient();
  const role = getUserRoleFromToken(token);

  async function advanceStatus() {
    setError(null);
    setLoading(true);
    try {
      const next = nextStatusMap[currentStatus];
      if (!next) {
        setLoading(false);
        return;
      }
      const response = await apiFetchClient(`/orders/${orderId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: next }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.message || "Error al actualizar estado");
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

  async function createBillingRequest() {
    setError(null);
    setLoading(true);
    try {
      const response = await apiFetchClient(`/orders/${orderId}/billing-request`, {
        method: "POST",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.message || "Error al crear solicitud de facturación");
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

  const canAdvance = !!nextStatusMap[currentStatus] && role && advanceRoles.includes(role);
  const canBill =
    (currentStatus === "entregado" || currentStatus === "facturado") && role && billRoles.includes(role);

  return (
    <div>
      {error && (
        <p style={{ color: "#c0392b", fontSize: "0.875rem", marginBottom: "0.75rem" }}>{error}</p>
      )}
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        {canAdvance && (
          <button
            onClick={advanceStatus}
            disabled={loading}
            style={{
              padding: "0.625rem 1.25rem",
              borderRadius: "0.5rem",
              border: "none",
              backgroundColor: "#10233f",
              color: "#ffffff",
              fontSize: "1rem",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Procesando..." : `Avanzar a ${statusLabels[nextStatusMap[currentStatus]]}`}
          </button>
        )}
        {canBill && (
          <button
            onClick={createBillingRequest}
            disabled={loading}
            style={{
              padding: "0.625rem 1.25rem",
              borderRadius: "0.5rem",
              border: "none",
              backgroundColor: "#9b59b6",
              color: "#ffffff",
              fontSize: "1rem",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Procesando..." : "Generar solicitud de facturación"}
          </button>
        )}
      </div>
    </div>
  );
}
