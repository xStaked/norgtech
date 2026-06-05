import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoicePaymentForm } from "@/components/invoices/invoice-payment-form";
import { InvoiceStatusAction } from "@/components/invoices/invoice-status-action";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiFetch } from "@/lib/api.server";
import { canCreate, type UserRole } from "@/lib/auth";
import { getCurrentUser } from "@/lib/auth.server";

interface InvoicePaymentSupport {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

interface InvoicePayment {
  id: string;
  paymentDate: string;
  amount: string;
  method: string;
  reference: string | null;
  notes: string | null;
  supports: InvoicePaymentSupport[];
}

interface InvoiceCustomer {
  id: string;
  displayName: string;
  taxId: string | null;
}

interface InvoiceOrder {
  id: string;
  orderNumber: string | null;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  customer: InvoiceCustomer;
  order: InvoiceOrder | null;
  issueDate: string;
  dueDate: string;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  totalPaid: string;
  status: string;
  notes: string | null;
  payments: InvoicePayment[];
}

const statusLabels: Record<string, string> = {
  emitida: "Emitida",
  enviada: "Enviada",
  parcialmente_pagada: "Parcialmente pagada",
  pagada: "Pagada",
  vencida: "Vencida",
  anulada: "Anulada",
};

const methodLabels: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  consignacion: "Consignacion",
  cheque: "Cheque",
  deposito: "Deposito",
  tarjeta: "Tarjeta",
  otro: "Otro",
};

const dateFormatter = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const currencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function formatCurrency(amount: number) {
  return currencyFormatter.format(amount);
}

function isOverdue(dueDate: string, status: string) {
  if (status === "pagada" || status === "anulada") return false;
  return new Date(dueDate) < new Date();
}

function isControlRole(role: UserRole | null) {
  return role === "administrador" || role === "director_comercial" || role === "facturacion";
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [response, user] = await Promise.all([
    apiFetch(`/invoices/${id}`),
    getCurrentUser(),
  ]);

  if (!response.ok) {
    notFound();
  }

  const invoice: Invoice = await response.json();
  const role = user?.role ?? null;
  const canEdit = isControlRole(role);

  const totalAmount = Number(invoice.totalAmount);
  const totalPaid = Number(invoice.totalPaid);
  const balance = totalAmount - totalPaid;
  const overdue = isOverdue(invoice.dueDate, invoice.status);

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <PageHeader
        eyebrow="Cartera"
        title={`Factura ${invoice.invoiceNumber}`}
        description={invoice.customer.displayName}
      />

      {overdue && (
        <div className="rounded-xl border border-destructive bg-destructive/10 p-4 text-destructive">
          <strong>Factura vencida</strong> — La fecha de vencimiento fue el{" "}
          {dateFormatter.format(new Date(invoice.dueDate))}.
        </div>
      )}

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(16rem,1fr))]">
        <SectionCard title="Informacion general">
          <div className="grid gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cliente</span>
              <Link href={`/customers/${invoice.customer.id}`} className="font-medium text-[#2d6cdf]">
                {invoice.customer.displayName}
              </Link>
            </div>
            {invoice.order && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pedido</span>
                <Link href={`/orders/${invoice.order.id}`} className="font-medium text-[#2d6cdf]">
                  {invoice.order.orderNumber ?? invoice.order.id}
                </Link>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Fecha de emision</span>
              <span>{dateFormatter.format(new Date(invoice.issueDate))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Fecha de vencimiento</span>
              <span className={overdue ? "text-destructive font-medium" : ""}>
                {dateFormatter.format(new Date(invoice.dueDate))}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Estado</span>
              <StatusBadge
                tone={
                  invoice.status === "pagada"
                    ? "success"
                    : invoice.status === "vencida"
                    ? "danger"
                    : invoice.status === "parcialmente_pagada"
                    ? "warning"
                    : "info"
                }
              >
                {statusLabels[invoice.status] ?? invoice.status}
              </StatusBadge>
            </div>
            {invoice.notes && (
              <div className="mt-1 border-t pt-2">
                <span className="text-muted-foreground">Notas</span>
                <p className="mt-1">{invoice.notes}</p>
              </div>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Totales">
          <div className="grid gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatCurrency(Number(invoice.subtotal))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">IVA</span>
              <span>{formatCurrency(Number(invoice.taxAmount))}</span>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span className="text-muted-foreground">Total</span>
              <strong>{formatCurrency(totalAmount)}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pagado</span>
              <span className="text-success">{formatCurrency(totalPaid)}</span>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span className="text-muted-foreground">Saldo</span>
              <strong className={balance > 0 ? "text-destructive" : "text-success"}>
                {formatCurrency(balance)}
              </strong>
            </div>
          </div>
        </SectionCard>
      </div>

      {canEdit && (
        <SectionCard title="Acciones">
          <InvoiceStatusAction
            invoiceId={invoice.id}
            currentStatus={invoice.status}
            canEdit={canEdit}
          />
          {balance > 0 && (
            <InvoicePaymentForm
              invoiceId={invoice.id}
              remainingBalance={balance}
              canEdit={canEdit}
            />
          )}
        </SectionCard>
      )}

      <SectionCard
        title={`Pagos (${invoice.payments.length})`}
        description="Historial de pagos registrados para esta factura."
      >
        {invoice.payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay pagos registrados.
          </p>
        ) : (
          <div className="grid gap-3">
            {invoice.payments.map((payment) => (
              <div
                key={payment.id}
                className="rounded-lg border border-border bg-muted p-3"
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">
                    {formatCurrency(Number(payment.amount))} —{" "}
                    {methodLabels[payment.method] ?? payment.method}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {dateFormatter.format(new Date(payment.paymentDate))}
                  </span>
                </div>
                {payment.reference && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    Ref: {payment.reference}
                  </div>
                )}
                {payment.notes && (
                  <div className="mt-1 text-xs">{payment.notes}</div>
                )}
                {payment.supports.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {payment.supports.map((support) => (
                      <a
                        key={support.id}
                        href={`${process.env.NEXT_PUBLIC_API_URL}/invoices/payments/${payment.id}/supports/${support.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center rounded-md bg-background px-2 py-1 text-xs font-medium text-[#2d6cdf] ring-1 ring-border"
                      >
                        {support.fileName}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
