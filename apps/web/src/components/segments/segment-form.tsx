"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchClient } from "@/lib/api.client";

export function SegmentForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const body = {
      name: String(formData.get("name")),
      description: String(formData.get("description") || ""),
    };

    try {
      const response = await apiFetchClient("/customer-segments", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.message || "Error al crear el segmento");
        setLoading(false);
        return;
      }

      router.push("/segments");
    } catch {
      setError("Error de conexión");
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: "grid",
        gap: "1rem",
        maxWidth: "40rem",
        backgroundColor: "#ffffff",
        padding: "1.5rem",
        borderRadius: "0.75rem",
        boxShadow: "0 2px 8px rgba(16, 35, 63, 0.04)",
      }}
    >
      {error && (
        <p style={{ color: "#c0392b", fontSize: "0.875rem", margin: 0 }}>{error}</p>
      )}

      <div style={{ display: "grid", gap: "0.25rem" }}>
        <label style={{ fontSize: "0.875rem", fontWeight: 600 }}>Nombre *</label>
        <input
          name="name"
          type="text"
          required
          style={{
            padding: "0.5rem 0.75rem",
            borderRadius: "0.5rem",
            border: "1px solid #c8d3e0",
            fontSize: "1rem",
          }}
        />
      </div>

      <div style={{ display: "grid", gap: "0.25rem" }}>
        <label style={{ fontSize: "0.875rem", fontWeight: 600 }}>Descripción</label>
        <textarea
          name="description"
          rows={3}
          style={{
            padding: "0.5rem 0.75rem",
            borderRadius: "0.5rem",
            border: "1px solid #c8d3e0",
            fontSize: "1rem",
            resize: "vertical",
          }}
        />
      </div>

      <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
        <button
          type="submit"
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
          {loading ? "Guardando..." : "Guardar segmento"}
        </button>
      </div>
    </form>
  );
}
