/**
 * Filtro de `order.findMany`/`order.groupBy` para los stubs de PrismaService.
 *
 * CreditService.getCustomerExposure consulta pedidos con un `where` compuesto
 * (status IN ..., sin factura activa, id != excluido). Un stub que devuelva
 * todos los pedidos ignorando el `where` haria pasar/fallar los tests por la
 * razon equivocada, asi que el filtro se implementa aqui una sola vez.
 */
export type OrderWhereStub = {
  customerId?: string | { in: string[] };
  companyId?: string;
  id?: { not?: string };
  status?: { in?: string[] };
  orderNumber?: { startsWith?: string };
  invoices?: { none?: { status?: { not?: string } } };
};

type InvoiceLike = { orderId?: string | null; status?: string | null };

export function matchesOrderWhere(
  order: Record<string, any>,
  where: OrderWhereStub | undefined,
  invoices: InvoiceLike[] = [],
): boolean {
  if (!where) return true;

  if (typeof where.customerId === "string" && order.customerId !== where.customerId) {
    return false;
  }
  if (
    where.customerId &&
    typeof where.customerId === "object" &&
    !where.customerId.in.includes(order.customerId)
  ) {
    return false;
  }
  if (where.companyId && order.companyId !== where.companyId) return false;
  if (where.id?.not && order.id === where.id.not) return false;
  if (where.status?.in && !where.status.in.includes(order.status)) return false;

  // nextOrderNumber consulta por prefijo de empresa: sin esto el stub le
  // devolveria tambien los consecutivos de las otras empresas.
  if (
    where.orderNumber?.startsWith &&
    !String(order.orderNumber ?? "").startsWith(where.orderNumber.startsWith)
  ) {
    return false;
  }

  if (where.invoices?.none) {
    const notStatus = where.invoices.none.status?.not;
    const hasMatchingInvoice = invoices.some(
      (invoice) =>
        invoice.orderId === order.id &&
        (notStatus === undefined || invoice.status !== notStatus),
    );
    if (hasMatchingInvoice) return false;
  }

  return true;
}
