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

interface FollowUpTaskFormProps {
  customers: Customer[];
  opportunities: Opportunity[];
}

const types = [
  { value: "llamada", label: "Llamada" },
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "reunion", label: "Reunión" },
  { value: "recordatorio", label: "Recordatorio" },
  { value: "otro", label: "Otro" },
];

export function FollowUpTaskForm({ customers, opportunities }: FollowUpTaskFormProps) {
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
      type: String(formData.get("type")),
      title: String(formData.get("title")),
      dueAt: String(formData.get("dueAt")),
      notes: optionalString("notes"),
    };

    try {
      const response = await apiFetchClient("/follow-up-tasks", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.message || "Error al crear la tarea");
        setLoading(false);
        return;
      }

      const created = await response.json();
      router.push(`/follow-ups/${created.id}`);
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
        <label style={{ fontSize: "0.875rem", fontWeight: 600 }}>Tipo *</label>
        <select
          name="type"
          required
          style={{
            padding: "0.5rem 0.75rem",
            borderRadius: "0.5rem",
            border: "1px solid #c8d3e0",
            fontSize: "1rem",
          }}
        >
          {types.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "grid", gap: "0.25rem" }}>
        <label style={{ fontSize: "0.875rem", fontWeight: 600 }}>Título *</label>
        <input
          name="title"
          type="text"
          required
          aria-label="Titulo"
          style={{
            padding: "0.5rem 0.75rem",
            borderRadius: "0.5rem",
            border: "1px solid #c8d3e0",
            fontSize: "1rem",
          }}
        />
      </div>

      <div style={{ display: "grid", gap: "0.25rem" }}>
        <label style={{ fontSize: "0.875rem", fontWeight: 600 }}>Fecha y hora *</label>
        <input
          name="dueAt"
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
          {loading ? "Guardando..." : "Guardar tarea"}
        </button>
      </div>
    </form>
  );
}
