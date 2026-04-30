"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { crmTheme } from "@/components/ui/theme";
import { apiFetchClient } from "@/lib/api.client";

interface VisitActionsProps {
  visitId: string;
}

export function VisitActions({ visitId }: VisitActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function markComplete() {
    setLoading(true);
    try {
      const response = await apiFetchClient(`/visits/${visitId}/complete`, {
        method: "PATCH",
        body: JSON.stringify({}),
      });
      if (response.ok) {
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  async function markCancelled() {
    setLoading(true);
    try {
      const response = await apiFetchClient(`/visits/${visitId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "cancelada" }),
      });
      if (response.ok) {
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={markComplete}
        disabled={loading}
        style={{
          minHeight: 44,
          padding: "0 16px",
          borderRadius: crmTheme.radius.md,
          border: 0,
          background: crmTheme.colors.success,
          color: "#ffffff",
          fontSize: 14,
          fontWeight: 700,
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.72 : 1,
        }}
      >
        Marcar como completada
      </button>
      <button
        type="button"
        onClick={markCancelled}
        disabled={loading}
        style={{
          minHeight: 44,
          padding: "0 16px",
          borderRadius: crmTheme.radius.md,
          border: "1px solid rgba(186, 58, 47, 0.2)",
          background: "#fff4f2",
          color: crmTheme.colors.danger,
          fontSize: 14,
          fontWeight: 700,
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.72 : 1,
        }}
      >
        Cancelar visita
      </button>
    </div>
  );
}
