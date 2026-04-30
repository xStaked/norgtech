"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", alignItems: "flex-start" }}>
      <button
        onClick={handleClick}
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
        {loading ? "Generando..." : "Generar solicitud de facturación"}
      </button>
      {message && (
        <div
          style={{
            fontSize: "0.875rem",
            color: message.includes("Error") ? "#c0392b" : "#27ae60",
            fontWeight: 500,
          }}
        >
          {message}
        </div>
      )}
    </div>
  );
}
