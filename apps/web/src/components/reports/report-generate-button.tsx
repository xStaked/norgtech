"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { crmTheme } from "@/components/ui/theme";
import { apiFetchClient } from "@/lib/api.client";

interface ReportGenerateButtonProps {
  visitId: string;
}

export function ReportGenerateButton({ visitId }: ReportGenerateButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetchClient(`/reports/from-visit/${visitId}`, {
        method: "POST",
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.message || `Error ${response.status}: no se pudo generar el reporte`);
        setLoading(false);
        return;
      }

      const report = await response.json();
      router.push(`/reports/${report.id}`);
    } catch {
      setError("Error de conexión con el servidor");
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {error && (
        <p style={{ color: "#c0392b", fontSize: "0.875rem", margin: 0 }}>{error}</p>
      )}
      <button
        type="button"
        onClick={handleGenerate}
        disabled={loading}
        style={{
          minHeight: 44,
          padding: "0 16px",
          borderRadius: crmTheme.radius.md,
          border: 0,
          background: crmTheme.colors.primary,
          color: "#ffffff",
          fontSize: 14,
          fontWeight: 700,
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.72 : 1,
          transition: crmTheme.motion.fast,
        }}
      >
        {loading ? "Generando..." : "Generar reporte ejecutivo"}
      </button>
    </div>
  );
}
