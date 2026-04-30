"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchClient } from "@/lib/api.client";

interface CreateBillingRequestModalProps {
  customers: Array<{ id: string; displayName: string }>;
}

export function CreateBillingRequestModal({ customers }: CreateBillingRequestModalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [sourceOrderId, setSourceOrderId] = useState("");
  const [sourceQuoteId, setSourceQuoteId] = useState("");
  const [notes, setNotes] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const body: Record<string, string> = { customerId };
      if (sourceOrderId) body.sourceOrderId = sourceOrderId;
      if (sourceQuoteId) body.sourceQuoteId = sourceQuoteId;
      if (notes) body.notes = notes;

      const response = await apiFetchClient("/billing-requests", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.message || "Error al crear solicitud");
        setLoading(false);
        return;
      }
      setOpen(false);
      setCustomerId("");
      setSourceOrderId("");
      setSourceQuoteId("");
      setNotes("");
      router.refresh();
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          padding: "0.625rem 1.25rem",
          borderRadius: "0.5rem",
          border: "none",
          backgroundColor: "#10233f",
          color: "#ffffff",
          fontSize: "1rem",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Crear solicitud
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(16, 35, 63, 0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            style={{
              backgroundColor: "#fff",
              padding: "1.5rem",
              borderRadius: "0.75rem",
              width: "100%",
              maxWidth: 480,
              boxShadow: "0 18px 48px rgba(16, 35, 63, 0.12)",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "1.25rem" }}>Nueva solicitud de facturación</h2>
            {error && <p style={{ color: "#c0392b", fontSize: 14, marginTop: 12 }}>{error}</p>}
            <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12, marginTop: 16 }}>
              <div>
                <label style={{ fontSize: 14, fontWeight: 600 }}>Cliente *</label>
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  required
                  style={{
                    marginTop: 4,
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid #c8d3e0",
                    fontSize: 14,
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
              <div>
                <label style={{ fontSize: 14, fontWeight: 600 }}>Pedido origen (opcional)</label>
                <input
                  value={sourceOrderId}
                  onChange={(e) => setSourceOrderId(e.target.value)}
                  placeholder="ID del pedido"
                  style={{
                    marginTop: 4,
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid #c8d3e0",
                    fontSize: 14,
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 14, fontWeight: 600 }}>Cotización origen (opcional)</label>
                <input
                  value={sourceQuoteId}
                  onChange={(e) => setSourceQuoteId(e.target.value)}
                  placeholder="ID de la cotización"
                  style={{
                    marginTop: 4,
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid #c8d3e0",
                    fontSize: 14,
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 14, fontWeight: 600 }}>Notas</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  style={{
                    marginTop: 4,
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid #c8d3e0",
                    fontSize: 14,
                    resize: "vertical",
                  }}
                />
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    border: "none",
                    backgroundColor: "#10233f",
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: loading ? "not-allowed" : "pointer",
                    opacity: loading ? 0.7 : 1,
                  }}
                >
                  {loading ? "Guardando..." : "Guardar"}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={loading}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    border: "1px solid #c8d3e0",
                    backgroundColor: "#fff",
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
