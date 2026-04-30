"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchClient } from "@/lib/api.client";

interface User {
  id: string;
  name: string;
}

interface OrderLogisticsSectionProps {
  orderId: string;
  assignedLogisticsUser: User | null;
  committedDeliveryDate: string | null;
  dispatchDate: string | null;
  deliveryDate: string | null;
  logisticsNotes: string | null;
  canEdit: boolean;
}

export function OrderLogisticsSection({
  orderId,
  assignedLogisticsUser,
  committedDeliveryDate,
  dispatchDate,
  deliveryDate,
  logisticsNotes,
  canEdit,
}: OrderLogisticsSectionProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    assignedLogisticsUserId: assignedLogisticsUser?.id ?? "",
    committedDeliveryDate: committedDeliveryDate ? committedDeliveryDate.slice(0, 10) : "",
    logisticsNotes: logisticsNotes ?? "",
  });

  async function handleSave() {
    setError(null);
    setLoading(true);
    try {
      const response = await apiFetchClient(`/orders/${orderId}/logistics`, {
        method: "PATCH",
        body: JSON.stringify({
          assignedLogisticsUserId: form.assignedLogisticsUserId || undefined,
          committedDeliveryDate: form.committedDeliveryDate || undefined,
          logisticsNotes: form.logisticsNotes || undefined,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.message || "Error al actualizar logística");
        setLoading(false);
        return;
      }
      setEditing(false);
      router.refresh();
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Logística</h3>
        {canEdit && !editing && (
          <button
            onClick={() => setEditing(true)}
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              border: "1px solid #c8d3e0",
              background: "#fff",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Editar
          </button>
        )}
      </div>

      {error && <p style={{ color: "#c0392b", fontSize: 14, marginTop: 8 }}>{error}</p>}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(14rem, 1fr))",
          gap: 12,
          marginTop: 12,
          padding: 16,
          borderRadius: 12,
          backgroundColor: "#f8fafc",
          border: "1px solid #e2e8f0",
        }}
      >
        {editing ? (
          <>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#6b7c93" }}>Usuario asignado (ID)</label>
              <input
                value={form.assignedLogisticsUserId}
                onChange={(e) => setForm({ ...form, assignedLogisticsUserId: e.target.value })}
                placeholder="ID de usuario"
                style={{
                  marginTop: 4,
                  width: "100%",
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid #c8d3e0",
                  fontSize: 14,
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#6b7c93" }}>Fecha comprometida</label>
              <input
                type="date"
                value={form.committedDeliveryDate}
                onChange={(e) => setForm({ ...form, committedDeliveryDate: e.target.value })}
                style={{
                  marginTop: 4,
                  width: "100%",
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid #c8d3e0",
                  fontSize: 14,
                }}
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#6b7c93" }}>Notas</label>
              <textarea
                value={form.logisticsNotes}
                onChange={(e) => setForm({ ...form, logisticsNotes: e.target.value })}
                rows={2}
                style={{
                  marginTop: 4,
                  width: "100%",
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid #c8d3e0",
                  fontSize: 14,
                  resize: "vertical",
                }}
              />
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "end", gridColumn: "1 / -1" }}>
              <button
                onClick={handleSave}
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
                onClick={() => setEditing(false)}
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
          </>
        ) : (
          <>
            <Info label="Usuario asignado" value={assignedLogisticsUser?.name ?? "Sin asignar"} />
            <Info
              label="Fecha comprometida"
              value={committedDeliveryDate ? new Date(committedDeliveryDate).toLocaleDateString("es-CO") : null}
            />
            <Info
              label="Fecha de despacho"
              value={dispatchDate ? new Date(dispatchDate).toLocaleDateString("es-CO") : null}
            />
            <Info
              label="Fecha de entrega"
              value={deliveryDate ? new Date(deliveryDate).toLocaleDateString("es-CO") : null}
            />
            {logisticsNotes && (
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#6b7c93" }}>Notas de logística</div>
                <div style={{ marginTop: 4, color: "#10233f" }}>{logisticsNotes}</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#6b7c93" }}>{label}</div>
      <div style={{ marginTop: 4, color: "#10233f" }}>{value}</div>
    </div>
  );
}
