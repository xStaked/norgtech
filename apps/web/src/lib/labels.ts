// Shared display-label helpers and enum/audit code -> Spanish label maps.
// Every map lookup should fall back to the raw code (`MAP[x] ?? x`) so an
// unmapped value degrades gracefully instead of rendering blank.

const percentFormatter = new Intl.NumberFormat("es-CO", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formats an already-scaled percentage value (e.g. 12.5 -> "12,50%") with at
 * least two decimals. Non-finite input degrades to "0,00%" (never NaN).
 */
export function formatPercent(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${percentFormatter.format(safe)}%`;
}

// --- Audit activity feed ----------------------------------------------------

export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  BillingRequest: "Solicitud de facturación",
  CommercialExpense: "Gasto comercial",
  Customer: "Cliente",
  FollowUpTask: "Seguimiento",
  Invoice: "Factura",
  InvoicePayment: "Pago de factura",
  Opportunity: "Oportunidad",
  Order: "Pedido",
  Quote: "Cotización",
  Return: "Devolución",
  Visit: "Visita",
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "billing_request.created_direct": "Solicitud de facturación creada",
  "billing_request.created_from_order": "Facturación creada desde pedido",
  "billing_request.created_from_quote": "Facturación creada desde cotización",
  "billing_request.status_changed": "Estado de facturación actualizado",
  classify_inbound_message: "Mensaje entrante clasificado",
  "commercial_expense.created": "Gasto comercial creado",
  "commercial_expense.status_changed": "Estado de gasto actualizado",
  "commercial_expense.updated": "Gasto comercial actualizado",
  "customer.created": "Cliente creado",
  "customer.segment_changed": "Segmento del cliente cambiado",
  "customer.updated": "Cliente actualizado",
  "follow_up_task.completed": "Seguimiento completado",
  "follow_up_task.created": "Seguimiento creado",
  "follow_up_task.status_changed": "Estado del seguimiento actualizado",
  "invoice.created": "Factura creada",
  "invoice.created_from_order": "Factura creada desde pedido",
  "invoice.payment_created": "Pago de factura registrado",
  "invoice.status_changed": "Estado de factura actualizado",
  "opportunity.created": "Oportunidad creada",
  "opportunity.stage_changed": "Etapa de oportunidad cambiada",
  "order.approved": "Pedido aprobado",
  "order.created": "Pedido creado",
  "order.item_resolved": "Ítem del pedido resuelto",
  "order.logistics_updated": "Logística del pedido actualizada",
  "order.rejected": "Pedido rechazado",
  "order.status_changed": "Estado del pedido actualizado",
  "quote.created": "Cotización creada",
  "quote.status_changed": "Estado de cotización actualizado",
  "return.created": "Devolución creada",
  "visit.completed": "Visita completada",
  "visit.created": "Visita creada",
  "visit.deleted": "Visita eliminada",
  "visit.status_changed": "Estado de la visita actualizado",
  "visit.updated": "Visita actualizada",
};

// --- Domain enum labels -----------------------------------------------------

export const OPPORTUNITY_STAGE_LABELS: Record<string, string> = {
  prospecto: "Prospecto",
  contacto: "Contacto",
  visita: "Visita",
  cotizacion: "Cotización",
  negociacion: "Negociación",
  orden_facturacion: "Orden de facturación",
  venta_cerrada: "Venta cerrada",
  perdida: "Perdida",
};

export const VISIT_STATUS_LABELS: Record<string, string> = {
  programada: "Programada",
  completada: "Completada",
  cancelada: "Cancelada",
  no_realizada: "No realizada",
};

export const FOLLOW_UP_TASK_STATUS_LABELS: Record<string, string> = {
  pendiente: "Pendiente",
  completada: "Completada",
  vencida: "Vencida",
};

export const FOLLOW_UP_TASK_TYPE_LABELS: Record<string, string> = {
  llamada: "Llamada",
  email: "Email",
  whatsapp: "WhatsApp",
  reunion: "Reunión",
  recordatorio: "Recordatorio",
  otro: "Otro",
};

export const QUOTE_STATUS_LABELS: Record<string, string> = {
  abierta: "Abierta",
  en_negociacion: "En negociación",
  cerrada: "Cerrada",
  perdida: "Perdida",
};

export const ORDER_STATUS_LABELS: Record<string, string> = {
  recibido: "Recibido",
  orden_facturacion: "Orden de facturación",
  facturado: "Facturado",
  despachado: "Despachado",
  en_transito: "En tránsito",
  entregado: "Entregado",
};

export const BILLING_REQUEST_STATUS_LABELS: Record<string, string> = {
  pendiente: "Pendiente",
  procesada: "Procesada",
  rechazada: "Rechazada",
};

// Origin of a billing request (source entity that spawned it).
export const BILLING_SOURCE_TYPE_LABELS: Record<string, string> = {
  order: "Pedido",
  quote: "Cotización",
  direct: "Directa",
};
