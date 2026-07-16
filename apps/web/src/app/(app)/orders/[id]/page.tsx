import Link from "next/link";
import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api.server";
import { getCurrentUser } from "@/lib/auth.server";
import { StatusBadge, type CrmStatusTone } from "@/components/ui/status-badge";
import { OrderActions } from "@/components/orders/order-actions";
import { OrderStatusTimeline } from "@/components/orders/order-status-timeline";
import { OrderLogisticsSection } from "@/components/orders/order-logistics-section";
import { OrderBillingHistory } from "@/components/orders/order-billing-history";
import { OrderReviewActions } from "@/components/orders/order-review-actions";

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
  company: { name: string; prefix: string } | null;
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

const statusTones: Record<string, CrmStatusTone> = {
  recibido: "info",
  orden_facturacion: "warning",
  facturado: "info",
  despachado: "info",
  en_transito: "warning",
  entregado: "success",
};

const nextStatusMap: Record<string, string> = {
  recibido: "orden_facturacion",
  orden_facturacion: "facturado",
  facturado: "despachado",
  despachado: "en_transito",
  en_transito: "entregado",
};

const billingStatusLabels: Record<string, string> = {
  pendiente: "Pendiente",
  procesada: "Procesada",
  rechazada: "Rechazada",
};

const billingStatusTones: Record<string, CrmStatusTone> = {
  pendiente: "warning",
  procesada: "success",
  rechazada: "danger",
};

function formatDate(value: string | null | undefined) {
  if (!value) return null;
  return new Date(value).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

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

  const customerName = order.customerNameSnapshot || order.customer?.displayName || "Cliente";
  const initials = customerName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  const subtitleParts = [
    formatDate(order.createdAt) ? `Creado el ${formatDate(order.createdAt)}` : null,
    customerName,
    order.preparedByName ? `Vendedor: ${order.preparedByName}` : null,
  ].filter(Boolean);

  const latestBilling = order.billingRequests[0] ?? null;

  return (
    <div className="grid gap-4">
      {/* breadcrumb */}
      <div className="flex items-center gap-2 text-[12.5px]">
        <Link
          href="/orders"
          className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[#e4e7ec] text-[#6b7787] transition-colors hover:bg-[#f5f7fa]"
          aria-label="Volver a pedidos"
        >
          ‹
        </Link>
        <Link href="/orders" className="text-[#6b7787] hover:text-[#0c2c44]">
          Pedidos
        </Link>
        <span className="text-[#c2cbd6]">/</span>
        <span className="font-semibold text-[#0c2c44]">{displayOrderNumber}</span>
      </div>

      {/* title row */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="m-0 text-[24px] font-extrabold tracking-[-0.02em] text-[#0c2c44]">
              Pedido {displayOrderNumber}
            </h1>
            <StatusBadge tone={statusTones[order.status] ?? "neutral"}>
              {statusLabels[order.status] || order.status}
            </StatusBadge>
          </div>
          {subtitleParts.length > 0 && (
            <p className="mt-1.5 text-[13px] text-[#6b7787]">{subtitleParts.join(" · ")}</p>
          )}
        </div>
        <OrderActions orderId={order.id} currentStatus={order.status} />
      </div>

      {/* body */}
      <div className="grid items-start gap-4 lg:grid-cols-[1.7fr_1fr]">
        {/* LEFT */}
        <div className="grid gap-4">
          {/* Productos */}
          <Card>
            <CardHeader
              title="Productos"
              aside={`${order.items.length} ${order.items.length === 1 ? "partida" : "partidas"}`}
            />
            <div className="mt-3 overflow-hidden rounded-[8px] border border-[#f0f2f6]">
              <div className="grid grid-cols-[1.6fr_0.8fr_0.5fr_0.9fr_0.9fr] bg-[#fafbfc] px-3 py-2 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-[#7a8696]">
                <span>Producto</span>
                <span>Clave</span>
                <span className="text-center">Cant.</span>
                <span className="text-right">P. unitario</span>
                <span className="text-right">Importe</span>
              </div>
              {order.items.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[1.6fr_0.8fr_0.5fr_0.9fr_0.9fr] items-start border-t border-[#f0f2f6] px-3 py-2.5 text-[12.5px] text-[#3a4658]"
                >
                  <div>
                    <div className="font-semibold text-[#0c2c44]">
                      {item.productSnapshotName || item.customProductName || item.productName}
                    </div>
                    {(item.presentationSnapshot || item.presentation || item.unit) && (
                      <div className="mt-0.5 text-[11.5px] text-[#9aa3b1]">
                        {item.presentationSnapshot || item.presentation || item.unit}
                      </div>
                    )}
                    {item.notes && (
                      <div className="mt-0.5 text-[11.5px] text-[#9aa3b1]">{item.notes}</div>
                    )}
                  </div>
                  <span className="text-[#6b7787]">{item.productSnapshotSku || "—"}</span>
                  <span className="text-center tabular-nums">
                    {Number(item.quantity).toLocaleString("es-CO")}
                  </span>
                  <span className="text-right tabular-nums">{money(Number(item.unitPrice))}</span>
                  <span className="text-right font-semibold tabular-nums text-[#0c2c44]">
                    {money(Number(item.subtotal))}
                  </span>
                </div>
              ))}
            </div>

            {/* totals */}
            <div className="mt-3 ml-auto w-full max-w-[260px] text-[12.5px]">
              <SummaryLine label="Subtotal" value={money(Number(order.subtotal))} />
              <SummaryLine label="IVA" value={money(itemTaxTotal)} />
              <div className="mt-1.5 flex items-center justify-between border-t border-[#f0f2f6] pt-2">
                <span className="font-semibold text-[#0c2c44]">Total</span>
                <span className="text-[16px] font-extrabold tabular-nums text-[#167c4a]">
                  {money(totalWithTax || Number(order.total))}
                </span>
              </div>
            </div>
          </Card>

          {/* Información del pedido */}
          <Card>
            <CardHeader title="Información del pedido" />
            <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-2">
              <Info label="Cliente" value={customerName} />
              <Info label="NIT" value={order.customerNitSnapshot} />
              {/* Empresa facturadora: preferir la relación company (fuente viva) sobre el snapshot histórico (ORD-03) */}
              <Info label="Empresa facturadora" value={order.company?.name ?? order.billingCompanyNameSnapshot} />
              <Info label="Sede" value={order.branchNameSnapshot} />
              <Info label="Orden de compra" value={order.purchaseOrderNumber} />
              <Info label="Fecha del pedido" value={formatDate(order.orderDate)} />
              <Info label="Oportunidad" value={order.opportunity?.title} />
              <Info
                label="Cotización origen"
                value={
                  order.sourceQuote ? (
                    <Link
                      href={`/quotes/${order.sourceQuote.id}`}
                      className="font-semibold text-[#0f5c8a] hover:underline"
                    >
                      Cotización #{order.sourceQuote.id.slice(-6)}
                    </Link>
                  ) : null
                }
              />
            </div>
            {order.notes && (
              <div className="mt-4 border-t border-[#f0f2f6] pt-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#7a8696]">
                  Notas
                </div>
                <div className="mt-1 text-[13px] text-[#3a4658]">{order.notes}</div>
              </div>
            )}
          </Card>

          {/* Solicitante */}
          {(order.requesterName ||
            order.requesterEmail ||
            order.requesterRole ||
            order.requesterPhone) && (
            <Card>
              <CardHeader title="Solicitante" />
              <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-2">
                <Info label="Nombre" value={order.requesterName} />
                <Info label="E-mail" value={order.requesterEmail} />
                <Info label="Cargo" value={order.requesterRole} />
                <Info label="Celular / teléfono" value={order.requesterPhone} />
              </div>
            </Card>
          )}

          {/* Información de entrega */}
          {(order.dispatchAddressSnapshot ||
            order.zone ||
            order.requestedDeliveryDate ||
            order.committedDeliveryDate ||
            order.deliveryInstructions ||
            order.receiverName ||
            order.invoiceFilingPlace) && (
            <Card>
              <CardHeader title="Información de entrega" />
              <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-2">
                <Info label="Dirección de despacho" value={order.dispatchAddressSnapshot} />
                <Info label="Zona" value={order.zone} />
                <Info
                  label="Fecha de entrega solicitada"
                  value={formatDate(order.requestedDeliveryDate)}
                />
                <Info label="Fecha comprometida" value={formatDate(order.committedDeliveryDate)} />
                <Info label="Instrucciones" value={order.deliveryInstructions} />
                <Info label="Persona autorizada" value={order.receiverName} />
                <Info label="Correo receptor" value={order.receiverEmail} />
                <Info label="Teléfono receptor" value={order.receiverPhone} />
                <Info label="Cargo receptor" value={order.receiverRole} />
                <Info label="Lugar radicación factura" value={order.invoiceFilingPlace} />
                <Info
                  label="Consecutivo cotización aprobada"
                  value={order.approvedQuoteConsecutive}
                />
              </div>
            </Card>
          )}

          {/* Aprobación */}
          {(order.approvalStatus ||
            order.approvalName ||
            order.preparedByName) && (
            <Card>
              <CardHeader title="Aprobación" />
              <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-2">
                <Info label="Estado" value={order.approvalStatus} />
                <Info label="Motivo" value={order.approvalReason} />
                <Info label="Nombre" value={order.approvalName} />
                <Info label="Fecha revisión" value={formatDate(order.reviewDate)} />
                <Info label="Elaboró" value={order.preparedByName} />
                <Info label="Cargo" value={order.preparedByRole} />
              </div>
            </Card>
          )}

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

          {order.approvalStatus === "en_revision" && (
            <OrderReviewActions
              orderId={order.id}
              approvalStatus={order.approvalStatus}
              items={order.items}
            />
          )}
        </div>

        {/* RIGHT */}
        <div className="grid gap-4">
          {/* Estado del pedido */}
          <Card>
            <CardHeader title="Estado del pedido" />
            <OrderStatusTimeline currentStatus={order.status} />
            <div className="mt-3 border-t border-[#f0f2f6] pt-2.5 text-[11.5px] font-medium text-[#9aa3b1]">
              {nextAction}
            </div>
          </Card>

          {/* Cliente */}
          <Card>
            <CardHeader title="Cliente" />
            <div className="mt-3 flex items-center gap-3">
              <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] bg-[#0c2c44] text-[13px] font-bold text-white">
                {initials || "CL"}
              </div>
              <div className="min-w-0">
                <div className="truncate font-semibold text-[#0c2c44]">{customerName}</div>
                {order.requesterEmail && (
                  <div className="truncate text-[12px] text-[#9aa3b1]">{order.requesterEmail}</div>
                )}
              </div>
            </div>
            {order.customer && (
              <div className="mt-3 border-t border-[#f0f2f6] pt-3">
                <Link
                  href={`/customers/${order.customer.id}`}
                  className="text-[13px] font-semibold text-[#0f5c8a] hover:underline"
                >
                  Ver perfil →
                </Link>
              </div>
            )}
          </Card>

          {/* Facturación / Pago */}
          <Card>
            <CardHeader title="Facturación" />
            <div className="mt-3 grid gap-2.5 text-[13px]">
              <div className="flex items-center justify-between">
                <span className="text-[#9aa3b1]">Estado del pedido</span>
                <StatusBadge tone={statusTones[order.status] ?? "neutral"}>
                  {statusLabels[order.status] || order.status}
                </StatusBadge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#9aa3b1]">Solicitudes</span>
                <span className="font-semibold tabular-nums text-[#3a4658]">
                  {order.billingRequests.length}
                </span>
              </div>
              {latestBilling && (
                <div className="flex items-center justify-between">
                  <span className="text-[#9aa3b1]">Última solicitud</span>
                  <StatusBadge tone={billingStatusTones[latestBilling.status] ?? "neutral"}>
                    {billingStatusLabels[latestBilling.status] ?? latestBilling.status}
                  </StatusBadge>
                </div>
              )}
            </div>
          </Card>

          {/* Nora */}
          <div className="rounded-[11px] border border-[#ddd6f7] bg-[linear-gradient(160deg,#f7f5ff,#fff)] p-4">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[#6d4ff0] text-[13px] text-white">
                ✦
              </div>
              <span className="text-[13px] font-bold text-[#0c2c44]">Nora sugiere</span>
            </div>
            <p className="mt-2 text-[12.5px] leading-relaxed text-[#6b7787]">
              {nextStatusMap[order.status]
                ? `Este pedido está en estado “${statusLabels[order.status]}”. Programa un seguimiento para avanzarlo a “${statusLabels[nextStatusMap[order.status]]}”.`
                : "El pedido está completado. Verifica la confirmación de entrega con el cliente."}
            </p>
            <button
              type="button"
              className="mt-3 h-[36px] w-full rounded-lg bg-[#6d4ff0] text-[13px] font-bold text-white transition-colors hover:bg-[#5d3fe0]"
            >
              Programar seguimiento
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-[11px] border border-[#e4e7ec] bg-white p-[18px]">
      {children}
    </section>
  );
}

function CardHeader({ title, aside }: { title: string; aside?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="m-0 text-[14.5px] font-extrabold text-[#0c2c44]">{title}</h2>
      {aside ? <span className="text-[12px] text-[#9aa3b1]">{aside}</span> : null}
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.03em] text-[#9aa3b1]">
        {label}
      </div>
      <div className="mt-0.5 text-[13px] text-[#3a4658]">{value}</div>
    </div>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-[#6b7787]">{label}</span>
      <span className="tabular-nums text-[#3a4658]">{value}</span>
    </div>
  );
}

function money(value: number) {
  return `$${value.toLocaleString("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}
