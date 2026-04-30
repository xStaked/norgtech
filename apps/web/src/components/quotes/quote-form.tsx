"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchClient } from "@/lib/api.client";

interface Product {
  id: string;
  name: string;
  sku: string;
  unit: string;
  basePrice: string;
}

interface Customer {
  id: string;
  displayName: string;
}

interface Opportunity {
  id: string;
  title: string;
}

interface QuoteItem {
  productId: string;
  quantity: number;
  unitPrice: number;
  notes: string;
}

interface QuoteFormProps {
  customers: Customer[];
  opportunities: Opportunity[];
  products: Product[];
}

export function QuoteForm({ customers, opportunities, products }: QuoteFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<QuoteItem[]>([
    { productId: "", quantity: 1, unitPrice: 0, notes: "" },
  ]);

  function addItem() {
    setItems([...items, { productId: "", quantity: 1, unitPrice: 0, notes: "" }]);
  }

  function removeItem(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: keyof QuoteItem, value: string | number) {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    if (field === "productId") {
      const product = products.find((p) => p.id === value);
      if (product) {
        updated[index].unitPrice = Number(product.basePrice);
      }
    }
    setItems(updated);
  }

  const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

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
      notes: optionalString("notes"),
      validUntil: optionalString("validUntil"),
      items: items
        .filter((item) => item.productId && item.quantity > 0)
        .map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          notes: item.notes,
        })),
    };

    if (body.items.length === 0) {
      setError("Debe agregar al menos un item válido");
      setLoading(false);
      return;
    }

    try {
      const response = await apiFetchClient("/quotes", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.message || "Error al crear la cotización");
        setLoading(false);
        return;
      }

      const created = await response.json();
      router.push(`/quotes/${created.id}`);
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
        maxWidth: "48rem",
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
        <label style={{ fontSize: "0.875rem", fontWeight: 600 }}>Oportunidad (opcional)</label>
        <select
          name="opportunityId"
          style={{
            padding: "0.5rem 0.75rem",
            borderRadius: "0.5rem",
            border: "1px solid #c8d3e0",
            fontSize: "1rem",
          }}
        >
          <option value="">Ninguna</option>
          {opportunities.map((o) => (
            <option key={o.id} value={o.id}>
              {o.title}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "grid", gap: "0.25rem" }}>
        <label style={{ fontSize: "0.875rem", fontWeight: 600 }}>Notas</label>
        <textarea
          name="notes"
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

      <div style={{ display: "grid", gap: "0.25rem" }}>
        <label style={{ fontSize: "0.875rem", fontWeight: 600 }}>Válida hasta</label>
        <input
          name="validUntil"
          type="date"
          style={{
            padding: "0.5rem 0.75rem",
            borderRadius: "0.5rem",
            border: "1px solid #c8d3e0",
            fontSize: "1rem",
          }}
        />
      </div>

      <hr style={{ border: "none", borderTop: "1px solid #e2e8f0", margin: "0.5rem 0" }} />

      <h3 style={{ margin: 0, fontSize: "1rem" }}>Items</h3>

      <div style={{ display: "grid", gap: "1rem" }}>
        {items.map((item, index) => (
          <div
            key={index}
            style={{
              padding: "1rem",
              borderRadius: "0.5rem",
              border: "1px solid #e2e8f0",
              backgroundColor: "#f8fafc",
              display: "grid",
              gap: "0.75rem",
            }}
          >
            <div style={{ display: "grid", gap: "0.25rem" }}>
              <label style={{ fontSize: "0.875rem", fontWeight: 600 }}>Producto</label>
              <select
                value={item.productId}
                onChange={(e) => updateItem(index, "productId", e.target.value)}
                style={{
                  padding: "0.5rem 0.75rem",
                  borderRadius: "0.5rem",
                  border: "1px solid #c8d3e0",
                  fontSize: "1rem",
                }}
              >
                <option value="">Seleccionar producto</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku}) — ${Number(p.basePrice).toLocaleString("es-CO")}/{p.unit}
                  </option>
                ))}
              </select>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "0.75rem",
              }}
            >
              <div style={{ display: "grid", gap: "0.25rem" }}>
                <label style={{ fontSize: "0.875rem", fontWeight: 600 }}>Cantidad</label>
                <input
                  type="number"
                  min={0.0001}
                  step={0.0001}
                  value={item.quantity}
                  onChange={(e) => updateItem(index, "quantity", Number(e.target.value))}
                  style={{
                    padding: "0.5rem 0.75rem",
                    borderRadius: "0.5rem",
                    border: "1px solid #c8d3e0",
                    fontSize: "1rem",
                  }}
                />
              </div>
              <div style={{ display: "grid", gap: "0.25rem" }}>
                <label style={{ fontSize: "0.875rem", fontWeight: 600 }}>Precio unitario</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={item.unitPrice}
                  onChange={(e) => updateItem(index, "unitPrice", Number(e.target.value))}
                  style={{
                    padding: "0.5rem 0.75rem",
                    borderRadius: "0.5rem",
                    border: "1px solid #c8d3e0",
                    fontSize: "1rem",
                  }}
                />
              </div>
              <div style={{ display: "grid", gap: "0.25rem" }}>
                <label style={{ fontSize: "0.875rem", fontWeight: 600 }}>Subtotal</label>
                <div
                  style={{
                    padding: "0.5rem 0.75rem",
                    borderRadius: "0.5rem",
                    border: "1px solid #e2e8f0",
                    backgroundColor: "#ffffff",
                    fontSize: "1rem",
                    color: "#10233f",
                    fontWeight: 600,
                  }}
                >
                  ${(item.quantity * item.unitPrice).toLocaleString("es-CO")}
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gap: "0.25rem" }}>
              <label style={{ fontSize: "0.875rem", fontWeight: 600 }}>Notas del item</label>
              <input
                type="text"
                value={item.notes}
                onChange={(e) => updateItem(index, "notes", e.target.value)}
                placeholder="Notas opcionales"
                style={{
                  padding: "0.5rem 0.75rem",
                  borderRadius: "0.5rem",
                  border: "1px solid #c8d3e0",
                  fontSize: "1rem",
                }}
              />
            </div>

            {items.length > 1 && (
              <button
                type="button"
                onClick={() => removeItem(index)}
                style={{
                  justifySelf: "start",
                  padding: "0.375rem 0.75rem",
                  borderRadius: "0.375rem",
                  border: "1px solid #c0392b",
                  backgroundColor: "transparent",
                  color: "#c0392b",
                  fontSize: "0.875rem",
                  cursor: "pointer",
                }}
              >
                Eliminar item
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addItem}
        style={{
          justifySelf: "start",
          padding: "0.5rem 1rem",
          borderRadius: "0.5rem",
          border: "1px dashed #6b7c93",
          backgroundColor: "transparent",
          color: "#6b7c93",
          fontSize: "0.875rem",
          cursor: "pointer",
        }}
      >
        + Agregar item
      </button>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "1rem",
          borderRadius: "0.5rem",
          backgroundColor: "#f0f4f8",
          fontWeight: 600,
          fontSize: "1.125rem",
        }}
      >
        <span>Total estimado</span>
        <span style={{ color: "#10233f" }}>${total.toLocaleString("es-CO")}</span>
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
          {loading ? "Guardando..." : "Guardar cotización"}
        </button>
      </div>
    </form>
  );
}
