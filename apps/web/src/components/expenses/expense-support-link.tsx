"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetchClient } from "@/lib/api.client";

interface ExpenseSupportLinkProps {
  expenseId: string;
  supportId: string;
  fileName: string;
}

export function ExpenseSupportLink({ expenseId, supportId, fileName }: ExpenseSupportLinkProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openSupport() {
    setError(null);
    setLoading(true);

    try {
      const response = await apiFetchClient(`/commercial-expenses/${expenseId}/supports/${supportId}`);
      if (!response.ok) {
        setError("No se pudo abrir el soporte.");
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setError("Error de conexion");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-2">
      <Button type="button" variant="outline" onClick={() => void openSupport()} disabled={loading}>
        <ExternalLink aria-hidden="true" />
        {loading ? "Abriendo..." : fileName}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
