import Link from "next/link";
import { apiFetch } from "@/lib/api.server";

interface Customer {
  id: string;
  displayName: string;
}

interface Order {
  id: string;
  status: string;
  subtotal: string;
  total: string;
  customer: Customer | null;
  createdAt: string;
}

const statusLabels: Record<string, string> = {
  recibido: "Recibido",
  orden_facturacion: "Orden de facturación",
  facturado: "Facturado",
  despachado: "Despachado",
  entregado: "Entregado",
};

const statusColors: Record<string, string> = {
  recibido: "#3498db",
  orden_facturacion: "#f39c12",
  facturado: "#9b59b6",
  despachado: "#1abc9c",
  entregado: "#27ae60",
};

export default async function OrdersPage() {
  const response = await apiFetch("/orders");
  const orders: Order[] = response.ok ? await response.json() : [];

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
        }}
      >
        <h1 style={{ margin: 0 }}>Pedidos</h1>
        <Link
          href="/orders/new"
          style={{
            padding: "0.5rem 1rem",
            borderRadius: "0.5rem",
            backgroundColor: "#10233f",
            color: "#ffffff",
            textDecoration: "none",
            fontWeight: 600,
            fontSize: "0.875rem",
          }}
        >
          Nuevo pedido
        </Link>
      </div>

      {orders.length === 0 ? (
        <p style={{ color: "#52637a" }}>No hay pedidos registrados.</p>
      ) : (
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/orders/${order.id}`}
              style={{
                display: "block",
                backgroundColor: "#ffffff",
                padding: "1rem 1.25rem",
                borderRadius: "0.75rem",
                boxShadow: "0 2px 8px rgba(16, 35, 63, 0.04)",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ fontWeight: 600, color: "#10233f" }}>
                  Pedido #{order.id.slice(-6)}
                </div>
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    padding: "0.25rem 0.5rem",
                    borderRadius: "0.25rem",
                    backgroundColor: statusColors[order.status] || "#6b7c93",
                    color: "#ffffff",
                    whiteSpace: "nowrap",
                  }}
                >
                  {statusLabels[order.status] || order.status}
                </span>
              </div>
              <div style={{ fontSize: "0.875rem", color: "#52637a", marginTop: "0.25rem" }}>
                {order.customer?.displayName}
              </div>
              <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#27ae60", marginTop: "0.5rem" }}>
                Total: ${Number(order.total).toLocaleString("es-CO")}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
