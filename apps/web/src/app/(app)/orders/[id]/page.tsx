import Link from "next/link";
import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api.server";
import { getCurrentUser } from "@/lib/auth.server";
import { OrderActions } from "@/components/orders/order-actions";
import { OrderStatusTimeline } from "@/components/orders/order-status-timeline";
import { OrderLogisticsSection } from "@/components/orders/order-logistics-section";
import { OrderBillingHistory } from "@/components/orders/order-billing-history";

interface Customer {
  id: string;
  displayName: string;
}

interface Opportunity {
  id: string;
  title: string;
}

interface Quote {
  id: string;
}

interface OrderItem {
  id: string;
  productSnapshotName: string;
  productSnapshotSku: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  subtotal: string;
  notes: string | null;
}

interface BillingRequest {
  id: string;
  status: string;
  createdAt: string;
}

interface LogisticsUser {
  id: string;
  name: string;
}

interface Order {
  id: string;
  status: string;
  subtotal: string;
  total: string;
  notes: string | null;
  requestedDeliveryDate: string | null;
  committedDeliveryDate: string | null;
  dispatchDate: string | null;
  deliveryDate: string | null;
  logisticsNotes: string | null;
  customer: Customer | null;
  opportunity: Opportunity | null;
  sourceQuote: Quote | null;
  items: OrderItem[];
  billingRequests: BillingRequest[];
  assignedLogisticsUser: LogisticsUser | null;
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

const nextStatusMap: Record<string, string> = {
  recibido: "orden_facturacion",
  orden_facturacion: "facturado",
  facturado: "despachado",
  despachado: "entregado",
};

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const response = await apiFetch(`/orders/${id}`);

  if (!response.ok) {
    notFound();
  }

  const order: Order = await response.json();
  const user = await getCurrentUser();
  const role = user?.role ?? null;

  const canEditLogistics = role === "administrador" || role === "logistica";
  const nextAction = nextStatusMap[order.status]
    ? `Siguiente acción válida: Avanzar a ${statusLabels[nextStatusMap[order.status]]}`
    : "Pedido completado";

  return (
    <div>
      <Link
        href="/orders"
        style={{
          fontSize: "0.875rem",
          color: "#52637a",
          textDecoration: "none",
          marginBottom: "1rem",
          display: "inline-block",
        }}
      >
        ← Volver a pedidos
      </Link>

      <div
        style={{
          backgroundColor: "#ffffff",
          padding: "1.5rem",
          borderRadius: "0.75rem",
          boxShadow: "0 2px 8px rgba(16, 35, 63, 0.04)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
          <h1 style={{ margin: 0 }}>Pedido #{order.id.slice(-6)}</h1>
          <span
            style={{
              fontSize: "0.875rem",
              fontWeight: 600,
              padding: "0.375rem 0.75rem",
              borderRadius: "0.375rem",
              backgroundColor: statusColors[order.status] || "#6b7c93",
              color: "#ffffff",
            }}
          >
            {statusLabels[order.status] || order.status}
          </span>
        </div>

        <OrderStatusTimeline currentStatus={order.status} />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(14rem, 1fr))",
            gap: "1rem",
            marginTop: "1.5rem",
          }}
        >
          <Info label="Cliente" value={order.customer?.displayName} />
          <Info label="Oportunidad" value={order.opportunity?.title} />
          <Info
            label="Cotización origen"
            value={
              order.sourceQuote ? (
                <Link href={`/quotes/${order.sourceQuote.id}`} style={{ color: "#2d6cdf", textDecoration: "none", fontWeight: 600 }}>
                  Cotización #{order.sourceQuote.id.slice(-6)}
                </Link>
              ) : null
            }
          />
          <Info
            label="Fecha de entrega solicitada"
            value={
              order.requestedDeliveryDate
                ? new Date(order.requestedDeliveryDate).toLocaleDateString("es-CO")
                : null
            }
          />
        </div>

        {order.notes && (
          <div style={{ marginTop: "1.5rem" }}>
            <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#6b7c93" }}>Notas</div>
            <div style={{ marginTop: "0.25rem", color: "#10233f" }}>{order.notes}</div>
          </div>
        )}

        <div style={{ marginTop: "1.5rem" }}>
          <h3 style={{ margin: 0, fontSize: "1rem" }}>Items</h3>
          <div style={{ display: "grid", gap: "0.75rem", marginTop: "0.75rem" }}>
            {order.items.map((item) => (
              <div
                key={item.id}
                style={{
                  padding: "0.75rem 1rem",
                  borderRadius: "0.5rem",
                  border: "1px solid #e2e8f0",
                  backgroundColor: "#f8fafc",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ fontWeight: 600 }}>{item.productSnapshotName}</div>
                  <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#27ae60" }}>
                    ${Number(item.subtotal).toLocaleString("es-CO")}
                  </div>
                </div>
                <div style={{ fontSize: "0.875rem", color: "#52637a", marginTop: "0.25rem" }}>
                  {item.productSnapshotSku} · {Number(item.quantity).toLocaleString("es-CO")} {item.unit} · ${" "}
                  {Number(item.unitPrice).toLocaleString("es-CO")}/{item.unit}
                </div>
                {item.notes && (
                  <div style={{ fontSize: "0.8125rem", color: "#6b7c93", marginTop: "0.25rem" }}>
                    {item.notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "1rem",
            borderRadius: "0.5rem",
            backgroundColor: "#f0f4f8",
            marginTop: "1.5rem",
            fontWeight: 600,
            fontSize: "1.125rem",
          }}
        >
          <span>Total</span>
          <span style={{ color: "#10233f" }}>${Number(order.total).toLocaleString("es-CO")}</span>
        </div>

        <OrderBillingHistory billingRequests={order.billingRequests} />

        <OrderLogisticsSection
          orderId={order.id}
          assignedLogisticsUser={order.assignedLogisticsUser}
          committedDeliveryDate={order.committedDeliveryDate}
          dispatchDate={order.dispatchDate}
          deliveryDate={order.deliveryDate}
          logisticsNotes={order.logisticsNotes}
          canEdit={canEditLogistics}
        />

        <div style={{ marginTop: "1.5rem", fontSize: "0.875rem", color: "#6b7c93", fontWeight: 500 }}>
          {nextAction}
        </div>

        <div style={{ marginTop: "1.5rem" }}>
          <OrderActions orderId={order.id} currentStatus={order.status} />
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div>
      <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#6b7c93" }}>{label}</div>
      <div style={{ marginTop: "0.25rem", color: "#10233f" }}>{value}</div>
    </div>
  );
}
