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
  productSnapshotName: string | null;
  productSnapshotSku: string | null;
  presentationSnapshot: string | null;
  customProductName: string | null;
  productName?: string | null;
  presentation?: string | null;
  unit: string | null;
  quantity: string;
  unitPrice: string;
  subtotal: string;
  taxPercent: string;
  taxAmount: string;
  totalWithTax: string;
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
  orderNumber: string | null;
  status: string;
  subtotal: string;
  total: string;
  notes: string | null;
  purchaseOrderNumber: string | null;
  orderDate: string | null;
  customerNameSnapshot: string | null;
  customerNitSnapshot: string | null;
  billingCompanyNameSnapshot: string | null;
  branchNameSnapshot: string | null;
  dispatchAddressSnapshot: string | null;
  requesterName: string | null;
  requesterEmail: string | null;
  requesterRole: string | null;
  requesterPhone: string | null;
  approvedQuoteConsecutive: string | null;
  deliveryInstructions: string | null;
  receiverName: string | null;
  receiverEmail: string | null;
  receiverPhone: string | null;
  receiverRole: string | null;
  invoiceFilingPlace: string | null;
  approvalStatus: string | null;
  approvalReason: string | null;
  approvalName: string | null;
  reviewDate: string | null;
  preparedByName: string | null;
  zone: string | null;
  preparedByRole: string | null;
  requestedDeliveryDate: string | null;
  committedDeliveryDate: string | null;
  dispatchDate: string | null;
  carrierName: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  deliveryDate: string | null;
  deliveredToName: string | null;
  deliveryConfirmationNotes: string | null;
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
  en_transito: "En tránsito",
  entregado: "Entregado",
};

const statusColors: Record<string, string> = {
  recibido: "#3498db",
  orden_facturacion: "#f39c12",
  facturado: "#9b59b6",
  despachado: "#1abc9c",
  en_transito: "#f59e0b",
  entregado: "#27ae60",
};

const nextStatusMap: Record<string, string> = {
  recibido: "orden_facturacion",
  orden_facturacion: "facturado",
  facturado: "despachado",
  despachado: "en_transito",
  en_transito: "entregado",
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
  const displayOrderNumber = order.orderNumber || `#${order.id.slice(-6)}`;
  const itemTaxTotal = order.items.reduce(
    (sum, item) => sum + Number(item.taxAmount || 0) * Number(item.quantity || 0),
    0,
  );
  const totalWithTax = order.items.reduce(
    (sum, item) => sum + Number(item.totalWithTax || 0),
    0,
  );

  return (
    <div className="grid gap-6">
      <Link
        href="/orders"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        ← Volver a pedidos
      </Link>

      <PageHeader
        title={`Pedido ${displayOrderNumber}`}
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
          <Info label="Cliente" value={order.customerNameSnapshot || order.customer?.displayName} />
          <Info label="NIT" value={order.customerNitSnapshot} />
          <Info label="Empresa facturadora" value={order.billingCompanyNameSnapshot} />
          <Info label="Sede" value={order.branchNameSnapshot} />
          <Info label="Orden de compra" value={order.purchaseOrderNumber} />
          <Info
            label="Fecha del pedido"
            value={order.orderDate ? new Date(order.orderDate).toLocaleDateString("es-CO") : null}
          />
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

        <DetailSection title="Solicitante">
          <Info label="Nombre" value={order.requesterName} />
          <Info label="E-mail" value={order.requesterEmail} />
          <Info label="Cargo" value={order.requesterRole} />
          <Info label="Celular/telefono" value={order.requesterPhone} />
        </DetailSection>

        <div className="mt-6">
          <h3 className="text-base font-semibold text-foreground">Productos</h3>
          <div className="mt-3 grid gap-3">
            {order.items.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-1 rounded-lg border border-border bg-muted p-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div>
                  <div className="font-semibold text-foreground">
                    {item.productSnapshotName || item.customProductName || item.productName}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {[
                      item.productSnapshotSku,
                      item.presentationSnapshot || item.presentation || item.unit,
                      `${Number(item.quantity).toLocaleString("es-CO")} unidades`,
                      `${money(Number(item.unitPrice))} unidad`,
                      `${Number(item.taxPercent || 0).toLocaleString("es-CO")}% IVA`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                  {item.notes && (
                    <div className="mt-1 text-sm text-muted-foreground">{item.notes}</div>
                  )}
                </div>
                <div className="grid gap-1 text-sm sm:text-right">
                  <div>Subtotal: {money(Number(item.subtotal))}</div>
                  <div>IVA: {money(Number(item.taxAmount || 0) * Number(item.quantity || 0))}</div>
                  <div className="font-semibold text-emerald-500 sm:text-base">
                    Total: {money(Number(item.totalWithTax || item.subtotal))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-2 rounded-lg bg-muted p-4 text-sm text-foreground md:ml-auto md:w-80">
          <SummaryLine label="Subtotal" value={money(Number(order.subtotal))} />
          <SummaryLine label="IVA" value={money(itemTaxTotal)} />
          <SummaryLine label="Total con IVA" value={money(totalWithTax || Number(order.total))} strong />
        </div>

        <DetailSection title="Entrega y facturacion">
          <Info label="Direccion despacho" value={order.dispatchAddressSnapshot} />
          <Info label="Consecutivo cotizacion aprobada" value={order.approvedQuoteConsecutive} />
          <Info label="Instrucciones" value={order.deliveryInstructions} />
          <Info label="Persona autorizada para recibir" value={order.receiverName} />
          <Info label="Correo receptor" value={order.receiverEmail} />
          <Info label="Telefono receptor" value={order.receiverPhone} />
          <Info label="Cargo receptor" value={order.receiverRole} />
          <Info label="Lugar radicacion factura" value={order.invoiceFilingPlace} />
        </DetailSection>

        <DetailSection title="Aprobacion">
          <Info label="Estado" value={order.approvalStatus} />
          <Info label="Motivo" value={order.approvalReason} />
          <Info label="Nombre" value={order.approvalName} />
          <Info
            label="Fecha revision"
            value={order.reviewDate ? new Date(order.reviewDate).toLocaleDateString("es-CO") : null}
          />
          <Info label="Elaboro" value={order.preparedByName} />
          <Info label="Zona" value={order.zone} />
          <Info label="Cargo" value={order.preparedByRole} />
        </DetailSection>

        <OrderBillingHistory billingRequests={order.billingRequests} />

        <OrderLogisticsSection
          orderId={order.id}
          assignedLogisticsUser={order.assignedLogisticsUser}
          committedDeliveryDate={order.committedDeliveryDate}
          dispatchDate={order.dispatchDate}
          carrierName={order.carrierName}
          trackingNumber={order.trackingNumber}
          trackingUrl={order.trackingUrl}
          deliveryDate={order.deliveryDate}
          deliveredToName={order.deliveredToName}
          deliveryConfirmationNotes={order.deliveryConfirmationNotes}
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

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6">
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <div className="mt-3 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(14rem,1fr))]">
        {children}
      </div>
    </div>
  );
}

function SummaryLine({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className={strong ? "flex justify-between text-lg font-semibold" : "flex justify-between"}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function money(value: number) {
  return `$${value.toLocaleString("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}
