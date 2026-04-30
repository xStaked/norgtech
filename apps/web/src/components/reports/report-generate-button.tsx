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

  async function handleGenerate() {
    setLoading(true);
    try {
      const response = await apiFetchClient(`/reports/from-visit/${visitId}`, {
        method: "POST",
        body: JSON.stringify({}),
      });

      if (response.ok) {
        const report = await response.json();
        router.push(`/reports/${report.id}`);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
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
  );
}
