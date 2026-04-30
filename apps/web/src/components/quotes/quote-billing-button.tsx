"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { crmTheme } from "@/components/ui/theme";
import { apiFetchClient } from "@/lib/api.client";

interface QuoteBillingButtonProps {
  quoteId: string;
}

export function QuoteBillingButton({ quoteId }: QuoteBillingButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setMessage(null);
    try {
      const response = await apiFetchClient(`/quotes/${quoteId}/billing-request`, {
        method: "POST",
      });
      if (response.ok) {
        setMessage("Solicitud de facturación generada correctamente.");
        router.refresh();
      } else {
        const data = await response.json().catch(() => ({}));
        setMessage(data.message || "Error al generar la solicitud de facturación.");
      }
    } catch {
      setMessage("Error al generar la solicitud de facturación.");
    } finally {
      setLoading(false);
    }
  }

  const isError = Boolean(message?.includes("Error"));

  return (
    <div style={{ display: "grid", gap: 10, justifyItems: "start" }}>
      <button
        type="button"
        onClick={handleClick}
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
          boxShadow: crmTheme.shadow.card,
        }}
      >
        {loading ? "Generando..." : "Generar solicitud de facturación"}
      </button>

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
