import Link from "next/link";
import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api.server";
import { getCurrentUser } from "@/lib/auth.server";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
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
    <div className="grid gap-6">
      <Link
        href="/orders"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        ← Volver a pedidos
      </Link>

      <PageHeader
        title={`Pedido #${order.id.slice(-6)}`}
        eyebrow={statusLabels[order.status] || order.status}
        actions={
          <span
            className="inline-flex items-center rounded-md px-3 py-1 text-sm font-semibold text-white"
            style={{
              backgroundColor: statusColors[order.status] || "#6b7c93",
            }}
          >
            {statusLabels[order.status] || order.status}
          </span>
        }
      />

      <SectionCard>
        <OrderStatusTimeline currentStatus={order.status} />

        <div className="mt-6 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(14rem,1fr))]">
          <Info label="Cliente" value={order.customer?.displayName} />
          <Info label="Oportunidad" value={order.opportunity?.title} />
          <Info
            label="Cotización origen"
            value={
              order.sourceQuote ? (
                <Link
                  href={`/quotes/${order.sourceQuote.id}`}
                  className="font-semibold text-primary hover:underline"
                >
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
          <div className="mt-6">
            <div className="text-sm font-semibold text-muted-foreground">Notas</div>
            <div className="mt-1 text-foreground">{order.notes}</div>
          </div>
        )}

        <div className="mt-6">
          <h3 className="text-base font-semibold text-foreground">Items</h3>
          <div className="mt-3 grid gap-3">
            {order.items.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-1 rounded-lg border border-border bg-muted p-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div>
                  <div className="font-semibold text-foreground">
                    {item.productSnapshotName}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {item.productSnapshotSku} · {Number(item.quantity).toLocaleString("es-CO")}{" "}
                    {item.unit} · ${Number(item.unitPrice).toLocaleString("es-CO")}/{item.unit}
                  </div>
                  {item.notes && (
                    <div className="mt-1 text-sm text-muted-foreground">{item.notes}</div>
                  )}
                </div>
                <div className="text-sm font-semibold text-emerald-500 sm:text-base">
                  ${Number(item.subtotal).toLocaleString("es-CO")}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between rounded-lg bg-muted p-4 text-lg font-semibold text-foreground">
          <span>Total</span>
          <span>${Number(order.total).toLocaleString("es-CO")}</span>
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

        <div className="mt-6 text-sm font-medium text-muted-foreground">
          {nextAction}
        </div>

        <div className="mt-6">
          <OrderActions orderId={order.id} currentStatus={order.status} />
        </div>
      </SectionCard>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-sm font-semibold text-muted-foreground">{label}</div>
      <div className="mt-1 text-foreground">{value}</div>
    </div>
  );
}
