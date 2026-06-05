"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchClient } from "@/lib/api.client";
import { getSessionTokenClient, getUserRoleFromToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";

interface OrderActionsProps {
  orderId: string;
  currentStatus: string;
}

const statusLabels: Record<string, string> = {
  recibido: "Recibido",
  orden_facturacion: "Orden de facturación",
  facturado: "Facturado",
  despachado: "Despachado",
  en_transito: "En tránsito",
  entregado: "Entregado",
};

const nextStatusMap: Record<string, string> = {
  recibido: "orden_facturacion",
  orden_facturacion: "facturado",
  facturado: "despachado",
  despachado: "en_transito",
  en_transito: "entregado",
};

const advanceRoles = ["administrador", "director_comercial", "comercial", "logistica"];
const billRoles = ["administrador", "director_comercial", "facturacion"];

export function OrderActions({ orderId, currentStatus }: OrderActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
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

  async function exportExcel() {
    setError(null);
    setExporting(true);
    try {
      const response = await apiFetchClient(`/orders/${orderId}/export`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.message || "Error al exportar el formato Excel");
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `pedido-${orderId.slice(-6)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Error de conexión");
    } finally {
      setExporting(false);
    }
  }

  const canAdvance = !!nextStatusMap[currentStatus] && role && advanceRoles.includes(role);
  const canBill =
    (currentStatus === "entregado" || currentStatus === "facturado") && role && billRoles.includes(role);

  return (
    <div>
      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <Button onClick={exportExcel} disabled={exporting} variant="outline">
          {exporting ? "Exportando..." : "Exportar formato Excel"}
        </Button>
        {canAdvance && (
          <Button onClick={advanceStatus} disabled={loading}>
            {loading ? "Procesando..." : `Avanzar a ${statusLabels[nextStatusMap[currentStatus]]}`}
          </Button>
        )}
        {canBill && (
          <Button
            onClick={createBillingRequest}
            disabled={loading}
            variant="secondary"
          >
            {loading ? "Procesando..." : "Generar solicitud de facturación"}
          </Button>
        )}
      </div>
    </div>
  );
}
