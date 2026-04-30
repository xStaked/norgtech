interface BillingRequest {
  id: string;
  status: string;
  createdAt: string;
}

interface OrderBillingHistoryProps {
  billingRequests: BillingRequest[];
}

const statusLabels: Record<string, string> = {
  pendiente: "Pendiente",
  procesada: "Procesada",
  rechazada: "Rechazada",
};

export function OrderBillingHistory({ billingRequests }: OrderBillingHistoryProps) {
  if (billingRequests.length === 0) return null;
  return (
    <div style={{ marginTop: 24 }}>
      <h3 style={{ margin: 0, fontSize: 16 }}>Solicitudes de facturación</h3>
      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        {billingRequests.map((br) => (
          <div
            key={br.id}
            style={{
              padding: "12px 16px",
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              backgroundColor: "#f8fafc",
              fontSize: 14,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <span style={{ fontWeight: 600 }}>Solicitud #{br.id.slice(-6)}</span>
            <span style={{ color: "#52637a" }}>
              {statusLabels[br.status] ?? br.status} — {new Date(br.createdAt).toLocaleDateString("es-CO")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
