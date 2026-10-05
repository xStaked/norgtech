"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetchClient } from "@/lib/api.client";

/**
 * Marca una comision como pagada (neto entregado al vendedor). Solo se renderiza
 * para admin/director y filas pendientes; la guarda real vive en el back
 * (PATCH /commissions/:id/paid responde 403 para el resto).
 */
export function CommissionMarkPaidButton({ commissionId }: { commissionId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function markPaid() {
    setError(null);
    setLoading(true);
    try {
      const response = await apiFetchClient(`/commissions/${commissionId}/paid`, {
        method: "PATCH",
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        setError(data.message ?? "No se pudo marcar como pagada.");
        return;
      }
      // La fila cambia de estado en el listado: refresca el server component.
      router.refresh();
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 4, justifyItems: "start" }}>
      <Button type="button" variant="outline" size="sm" onClick={() => void markPaid()} disabled={loading}>
        <Check aria-hidden="true" />
        {loading ? "Procesando..." : "Marcar pagada"}
      </Button>
      {error ? (
        <span style={{ fontSize: 11, color: "#ef4444", fontWeight: 600 }}>{error}</span>
      ) : null}
    </div>
  );
}
