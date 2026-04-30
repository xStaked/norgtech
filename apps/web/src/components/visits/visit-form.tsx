"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchClient } from "@/lib/api.client";

interface Customer {
  id: string;
  displayName: string;
}

interface Opportunity {
  id: string;
  title: string;
}

interface VisitFormProps {
  customers: Customer[];
  opportunities: Opportunity[];
}

export function VisitForm({ customers, opportunities }: VisitFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(event.currentTarget);

    const optionalString = (key: string) => {
      const value = formData.get(key);
      return value && String(value).trim() ? String(value).trim() : undefined;
    };

    const body = {
      customerId: String(formData.get("customerId")),
      opportunityId: optionalString("opportunityId"),
      scheduledAt: String(formData.get("scheduledAt")),
      summary: String(formData.get("summary")),
      notes: optionalString("notes"),
      nextStep: optionalString("nextStep"),
    };

    try {
      const response = await apiFetchClient("/visits", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.message || "Error al crear la visita");
        setLoading(false);
        return;
      }

      const created = await response.json();
      router.push(`/visits/${created.id}`);
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
        <label style={{ fontSize: "0.875rem", fontWeight: 600 }}>Cliente *</label>
        <select
          name="customerId"
          required
          style={{
            padding: "0.5rem 0.75rem",
            borderRadius: "0.5rem",
            border: "1px solid #c8d3e0",
            fontSize: "1rem",
          }}
        >
          <option value="">Seleccionar cliente</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.displayName}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "grid", gap: "0.25rem" }}>
        <label style={{ fontSize: "0.875rem", fontWeight: 600 }}>Oportunidad</label>
        <select
          name="opportunityId"
          style={{
            padding: "0.5rem 0.75rem",
            borderRadius: "0.5rem",
            border: "1px solid #c8d3e0",
            fontSize: "1rem",
          }}
        >
          <option value="">Seleccionar oportunidad</option>
          {opportunities.map((o) => (
            <option key={o.id} value={o.id}>
              {o.title}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "grid", gap: "0.25rem" }}>
        <label style={{ fontSize: "0.875rem", fontWeight: 600 }}>Fecha y hora *</label>
        <input
          name="scheduledAt"
          type="datetime-local"
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
        <label style={{ fontSize: "0.875rem", fontWeight: 600 }}>Resumen *</label>
        <input
          name="summary"
          type="text"
          required
          aria-label="Resumen"
          style={{
            padding: "0.5rem 0.75rem",
            borderRadius: "0.5rem",
            border: "1px solid #c8d3e0",
            fontSize: "1rem",
          }}
        />
      </div>

      <div style={{ display: "grid", gap: "0.25rem" }}>
        <label style={{ fontSize: "0.875rem", fontWeight: 600 }}>Notas</label>
        <textarea
          name="notes"
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

      <div style={{ display: "grid", gap: "0.25rem" }}>
        <label style={{ fontSize: "0.875rem", fontWeight: 600 }}>Siguiente paso</label>
        <input
          name="nextStep"
          type="text"
          style={{
            padding: "0.5rem 0.75rem",
            borderRadius: "0.5rem",
            border: "1px solid #c8d3e0",
            fontSize: "1rem",
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
          {loading ? "Guardando..." : "Guardar visita"}
        </button>
      </div>
    </form>
  );
}
