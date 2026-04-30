"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchClient } from "@/lib/api";

interface Segment {
  id: string;
  name: string;
}

interface CustomerFormProps {
  segments: Segment[];
}

export function CustomerForm({ segments }: CustomerFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(event.currentTarget);

    const body = {
      legalName: String(formData.get("legalName")),
      displayName: String(formData.get("displayName")),
      taxId: String(formData.get("taxId") || ""),
      phone: String(formData.get("phone") || ""),
      email: String(formData.get("email") || ""),
      address: String(formData.get("address") || ""),
      city: String(formData.get("city") || ""),
      department: String(formData.get("department") || ""),
      notes: String(formData.get("notes") || ""),
      segmentId: String(formData.get("segmentId")),
      contacts: [
        {
          fullName: String(formData.get("contactFullName")),
          roleTitle: String(formData.get("contactRoleTitle") || ""),
          phone: String(formData.get("contactPhone") || ""),
          email: String(formData.get("contactEmail") || ""),
          isPrimary: true,
          notes: String(formData.get("contactNotes") || ""),
        },
      ],
    };

    try {
      const response = await apiFetchClient("/customers", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.message || "Error al crear el cliente");
        setLoading(false);
        return;
      }

      const created = await response.json();
      router.push(`/customers/${created.id}`);
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
        <label style={{ fontSize: "0.875rem", fontWeight: 600 }}>Segmento *</label>
        <select
          name="segmentId"
          required
          style={{
            padding: "0.5rem 0.75rem",
            borderRadius: "0.5rem",
            border: "1px solid #c8d3e0",
            fontSize: "1rem",
          }}
        >
          <option value="">Seleccionar segmento</option>
          {segments.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "grid", gap: "0.25rem" }}>
        <label style={{ fontSize: "0.875rem", fontWeight: 600 }}>Razón social *</label>
        <input
          name="legalName"
          type="text"
          required
          aria-label="Razon social"
          style={{
            padding: "0.5rem 0.75rem",
            borderRadius: "0.5rem",
            border: "1px solid #c8d3e0",
            fontSize: "1rem",
          }}
        />
      </div>

      <div style={{ display: "grid", gap: "0.25rem" }}>
        <label style={{ fontSize: "0.875rem", fontWeight: 600 }}>Nombre comercial *</label>
        <input
          name="displayName"
          type="text"
          required
          aria-label="Nombre comercial"
          style={{
            padding: "0.5rem 0.75rem",
            borderRadius: "0.5rem",
            border: "1px solid #c8d3e0",
            fontSize: "1rem",
          }}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "1rem",
        }}
      >
        <div style={{ display: "grid", gap: "0.25rem" }}>
          <label style={{ fontSize: "0.875rem", fontWeight: 600 }}>NIT</label>
          <input
            name="taxId"
            type="text"
            style={{
              padding: "0.5rem 0.75rem",
              borderRadius: "0.5rem",
              border: "1px solid #c8d3e0",
              fontSize: "1rem",
            }}
          />
        </div>
        <div style={{ display: "grid", gap: "0.25rem" }}>
          <label style={{ fontSize: "0.875rem", fontWeight: 600 }}>Teléfono</label>
          <input
            name="phone"
            type="text"
            style={{
              padding: "0.5rem 0.75rem",
              borderRadius: "0.5rem",
              border: "1px solid #c8d3e0",
              fontSize: "1rem",
            }}
          />
        </div>
      </div>

      <div style={{ display: "grid", gap: "0.25rem" }}>
        <label style={{ fontSize: "0.875rem", fontWeight: 600 }}>Correo electrónico</label>
        <input
          name="email"
          type="email"
          style={{
            padding: "0.5rem 0.75rem",
            borderRadius: "0.5rem",
            border: "1px solid #c8d3e0",
            fontSize: "1rem",
          }}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "1rem",
        }}
      >
        <div style={{ display: "grid", gap: "0.25rem" }}>
          <label style={{ fontSize: "0.875rem", fontWeight: 600 }}>Ciudad</label>
          <input
            name="city"
            type="text"
            style={{
              padding: "0.5rem 0.75rem",
              borderRadius: "0.5rem",
              border: "1px solid #c8d3e0",
              fontSize: "1rem",
            }}
          />
        </div>
        <div style={{ display: "grid", gap: "0.25rem" }}>
          <label style={{ fontSize: "0.875rem", fontWeight: 600 }}>Departamento</label>
          <input
            name="department"
            type="text"
            style={{
              padding: "0.5rem 0.75rem",
              borderRadius: "0.5rem",
              border: "1px solid #c8d3e0",
              fontSize: "1rem",
            }}
          />
        </div>
      </div>

      <div style={{ display: "grid", gap: "0.25rem" }}>
        <label style={{ fontSize: "0.875rem", fontWeight: 600 }}>Dirección</label>
        <input
          name="address"
          type="text"
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

      <hr style={{ border: "none", borderTop: "1px solid #e2e8f0", margin: "0.5rem 0" }} />

      <h3 style={{ margin: 0, fontSize: "1rem" }}>Contacto principal</h3>

      <div style={{ display: "grid", gap: "0.25rem" }}>
        <label style={{ fontSize: "0.875rem", fontWeight: 600 }}>Nombre completo *</label>
        <input
          name="contactFullName"
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "1rem",
        }}
      >
        <div style={{ display: "grid", gap: "0.25rem" }}>
          <label style={{ fontSize: "0.875rem", fontWeight: 600 }}>Cargo</label>
          <input
            name="contactRoleTitle"
            type="text"
            style={{
              padding: "0.5rem 0.75rem",
              borderRadius: "0.5rem",
              border: "1px solid #c8d3e0",
              fontSize: "1rem",
            }}
          />
        </div>
        <div style={{ display: "grid", gap: "0.25rem" }}>
          <label style={{ fontSize: "0.875rem", fontWeight: 600 }}>Teléfono</label>
          <input
            name="contactPhone"
            type="text"
            style={{
              padding: "0.5rem 0.75rem",
              borderRadius: "0.5rem",
              border: "1px solid #c8d3e0",
              fontSize: "1rem",
            }}
          />
        </div>
      </div>

      <div style={{ display: "grid", gap: "0.25rem" }}>
        <label style={{ fontSize: "0.875rem", fontWeight: 600 }}>Correo del contacto</label>
        <input
          name="contactEmail"
          type="email"
          style={{
            padding: "0.5rem 0.75rem",
            borderRadius: "0.5rem",
            border: "1px solid #c8d3e0",
            fontSize: "1rem",
          }}
        />
      </div>

      <div style={{ display: "grid", gap: "0.25rem" }}>
        <label style={{ fontSize: "0.875rem", fontWeight: 600 }}>Notas del contacto</label>
        <textarea
          name="contactNotes"
          rows={2}
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
          {loading ? "Guardando..." : "Guardar cliente"}
        </button>
      </div>
    </form>
  );
}
