import Link from "next/link";
import { ButtonLink } from "@/components/ui/button-link";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import type { CrmStatusTone } from "@/components/ui/theme";
import { apiFetch } from "@/lib/api.server";
import { canCreate, type UserRole } from "@/lib/auth";
import { getCurrentUser } from "@/lib/auth.server";

interface InvoiceCustomer {
  id: string;
  displayName: string;
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
  totalAmount: string;
  totalPaid: string;
  status: string;
  company: { id: string; name: string; prefix: string } | null;
}

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerId: string;
  issueDate: string;
  dueDate: string;
  totalAmount: number;
  totalPaid: number;
  balance: number;
  status: string;
  companyName: string | null;
  companyPrefix: string | null;
}

const statusLabels: Record<string, string> = {
  emitida: "Emitida",
  enviada: "Enviada",
  parcialmente_pagada: "Parcialmente pagada",
  pagada: "Pagada",
  vencida: "Vencida",
  anulada: "Anulada",
};

const statusTones: Record<string, CrmStatusTone> = {
  emitida: "info",
  enviada: "info",
  parcialmente_pagada: "warning",
  pagada: "success",
  vencida: "danger",
  anulada: "neutral",
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

function buildQueryString(params: Record<string, string | string[] | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined) return;
    if (Array.isArray(value)) {
      value.forEach((item) => query.append(key, item));
      return;
    }
    query.set(key, value);
  });
  return query.toString();
}

function countByStatus(rows: InvoiceRow[], status: string) {
  return rows.filter((row) => row.status === status).length.toLocaleString("es-CO");
}

const columns: readonly DataTableColumn<InvoiceRow>[] = [
  {
    key: "invoiceNumber",
    header: "Factura",
    render: (row) => (
      <Link
        href={`/invoices/${row.id}`}
        style={{ color: "#0f5c8a", textDecoration: "none", fontWeight: 700 }}
      >
        {row.invoiceNumber}
      </Link>
    ),
  },
  {
    key: "company",
    header: "Empresa",
    render: (row) =>
      row.companyPrefix ? (
        <span style={{ fontSize: 13, fontWeight: 600 }}>{row.companyPrefix}</span>
      ) : (
        <span style={{ fontSize: 13, color: "#6b7787" }}>—</span>
      ),
  },
  {
    key: "customer",
    header: "Cliente",
    render: (row) => (
      <Link
        href={`/customers/${row.customerId}`}
        style={{ color: "#0f5c8a", textDecoration: "none", fontWeight: 600 }}
      >
        {row.customerName}
      </Link>
    ),
  },
  {
    key: "issueDate",
    header: "Emision",
    render: (row) => dateFormatter.format(new Date(row.issueDate)),
  },
  {
    key: "dueDate",
    header: "Vencimiento",
    render: (row) => dateFormatter.format(new Date(row.dueDate)),
  },
  {
    key: "totalAmount",
    header: "Total",
    align: "right",
    render: (row) => formatCurrency(row.totalAmount),
  },
  {
    key: "totalPaid",
    header: "Pagado",
    align: "right",
    render: (row) => formatCurrency(row.totalPaid),
  },
  {
    key: "balance",
    header: "Saldo",
    align: "right",
    render: (row) => (
      <strong style={{ color: row.balance > 0 ? "#ef4444" : "#22c55e" }}>
        {formatCurrency(row.balance)}
      </strong>
    ),
  },
  {
    key: "status",
    header: "Estado",
    render: (row) => (
      <StatusBadge tone={statusTones[row.status] ?? "neutral"}>
        {statusLabels[row.status] ?? row.status}
      </StatusBadge>
    ),
  },
] as const;

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const queryString = buildQueryString(params);
  const listPath = queryString ? `/invoices?${queryString}` : "/invoices";

  const [response, user] = await Promise.all([
    apiFetch(listPath),
    getCurrentUser(),
  ]);

  const invoices: Invoice[] = response.ok ? await response.json() : [];
  const role = user?.role ?? null;

  const rows: InvoiceRow[] = invoices.map((invoice) => ({
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    customerName: invoice.customer.displayName,
    customerId: invoice.customer.id,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    totalAmount: Number(invoice.totalAmount),
    totalPaid: Number(invoice.totalPaid),
    balance: Number(invoice.totalAmount) - Number(invoice.totalPaid),
    status: invoice.status,
    companyName: invoice.company?.name ?? null,
    companyPrefix: invoice.company?.prefix ?? null,
  }));

  const totalBalance = rows.reduce((sum, row) => sum + row.balance, 0);
  const filterSummary = `${rows.length.toLocaleString("es-CO")} facturas - Saldo pendiente: ${formatCurrency(totalBalance)}`;

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <PageHeader
        eyebrow="Control financiero"
        title="Cartera"
        description="Facturas, pagos, vencimientos y saldos por cliente."
        actions={
          <>
            {canCreate(role, "invoice") && (
              <ButtonLink href="/invoices/new">Nueva factura</ButtonLink>
            )}
          </>
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 16,
        }}
      >
        <StatCard
          label="Emitidas"
          value={countByStatus(rows, "emitida")}
          tone="info"
        />
        <StatCard
          label="Enviadas"
          value={countByStatus(rows, "enviada")}
          tone="info"
        />
        <StatCard
          label="Parcialmente pagadas"
          value={countByStatus(rows, "parcialmente_pagada")}
          tone="warning"
        />
        <StatCard
          label="Vencidas"
          value={countByStatus(rows, "vencida")}
          tone="danger"
        />
        <StatCard
          label="Pagadas"
          value={countByStatus(rows, "pagada")}
          tone="success"
        />
      </div>

      <FilterBar summary={filterSummary} />

      <SectionCard
        title="Facturas"
        description="Revisa estado, vencimiento, total, pagos y saldo de cada factura."
      >
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.id}
          emptyState={
            <EmptyState
              title="No hay facturas registradas"
              description="Crea la primera factura para iniciar el control de cartera."
              action={
                canCreate(role, "invoice") && (
                  <ButtonLink href="/invoices/new">Crear factura</ButtonLink>
                )
              }
            />
          }
        />
      </SectionCard>
    </div>
  );
}
