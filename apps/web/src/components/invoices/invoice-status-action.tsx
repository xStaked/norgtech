"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchClient } from "@/lib/api.client";
import { Button } from "@/components/ui/button";

interface InvoiceStatusActionProps {
  invoiceId: string;
  currentStatus: string;
  canEdit: boolean;
}

const transitions: Record<string, string[]> = {
  emitida: ["enviada", "anulada"],
  enviada: ["parcialmente_pagada", "pagada", "vencida", "anulada"],
  parcialmente_pagada: ["pagada", "vencida"],
  vencida: ["pagada", "parcialmente_pagada"],
  pagada: [],
  anulada: [],
};

const statusLabels: Record<string, string> = {
  emitida: "Emitida",
  enviada: "Enviada",
  parcialmente_pagada: "Parcialmente pagada",
  pagada: "Pagada",
  vencida: "Vencida",
  anulada: "Anulada",
};

export function InvoiceStatusAction({
  invoiceId,
  currentStatus,
  canEdit,
}: InvoiceStatusActionProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canEdit || transitions[currentStatus].length === 0) return null;

  async function handleChange(status: string) {
    setError(null);
    setLoading(true);
    try {
      const response = await apiFetchClient(
        `/invoices/${invoiceId}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ status }),
        },
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.message || "Error al cambiar estado");
        setLoading(false);
        return;
      }
      router.refresh();
    } catch {
      setError("Error de conexion");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {transitions[currentStatus].map((status) => (
        <Button
          key={status}
          variant="outline"
          size="sm"
          onClick={() => handleChange(status)}
          disabled={loading}
        >
          {statusLabels[status] ?? status}
        </Button>
      ))}
    </div>
  );
}
