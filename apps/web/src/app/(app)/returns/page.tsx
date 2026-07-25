import Link from "next/link";
import { ButtonLink } from "@/components/ui/button-link";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ListFilters } from "@/components/ui/list-filters";
import { applyFilters, type SearchParams } from "@/lib/list-filter";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiFetch } from "@/lib/api.server";
import { canCreate } from "@/lib/auth";
import { getCurrentUser } from "@/lib/auth.server";

interface ReturnItem {
  id: string;
  returnDate: string;
  amount: string;
  reason: string;
  customer: { id: string; displayName: string };
  order: { id: string; orderNumber: string | null } | null;
  invoice: { id: string; invoiceNumber: string; status: string } | null;
}

interface ReturnRow {
  id: string;
  returnDate: string;
  amount: number;
  reason: string;
  customerName: string;
  customerId: string;
  invoiceNumber: string | null;
  invoiceId: string | null;
}

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

const columns: readonly DataTableColumn<ReturnRow>[] = [
  {
    key: "returnDate",
    header: "Fecha",
    render: (row) => dateFormatter.format(new Date(row.returnDate)),
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
    key: "invoice",
    header: "Factura",
    render: (row) =>
      row.invoiceId ? (
        <Link
          href={`/invoices/${row.invoiceId}`}
          style={{ color: "#0f5c8a", textDecoration: "none", fontWeight: 600 }}
        >
          {row.invoiceNumber}
        </Link>
      ) : (
        <StatusBadge tone="neutral">Sin factura</StatusBadge>
      ),
  },
  {
    key: "reason",
    header: "Motivo",
    render: (row) => row.reason,
  },
  {
    key: "amount",
    header: "Monto",
    align: "right",
    render: (row) => <strong>{formatCurrency(row.amount)}</strong>,
  },
] as const;

export default async function ReturnsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const [response, user] = await Promise.all([apiFetch("/returns"), getCurrentUser()]);

  const returns: ReturnItem[] = response.ok ? await response.json() : [];
  const role = user?.role ?? null;

  const rows: ReturnRow[] = returns.map((item) => ({
    id: item.id,
    returnDate: item.returnDate,
    amount: Number(item.amount),
    reason: item.reason,
    customerName: item.customer.displayName,
    customerId: item.customer.id,
    invoiceNumber: item.invoice?.invoiceNumber ?? null,
    invoiceId: item.invoice?.id ?? null,
  }));

  const filtered = applyFilters(rows, params, {
    search: (row) => [row.customerName, row.reason, row.invoiceNumber],
    match: { creditNote: (row) => (row.invoiceId ? "si" : "no") },
  });

  const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0);
  const filteredAmount = filtered.reduce((sum, row) => sum + row.amount, 0);
  const withCreditNote = rows.filter((row) => row.invoiceId).length;

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <PageHeader
        eyebrow="Control comercial"
        title="Devoluciones"
        description="Devoluciones de clientes y notas credito que ajustan la cartera."
        actions={
          canCreate(role, "returns") && (
            <ButtonLink href="/returns/new">Nueva devolucion</ButtonLink>
          )
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 16,
        }}
      >
        <StatCard label="Devoluciones" value={rows.length.toLocaleString("es-CO")} tone="info" />
        <StatCard label="Monto total" value={formatCurrency(totalAmount)} tone="warning" />
        <StatCard
          label="Con nota credito"
          value={withCreditNote.toLocaleString("es-CO")}
          tone="success"
        />
      </div>

      <ListFilters
        searchPlaceholder="Buscar por cliente, motivo o factura"
        selects={[
          {
            key: "creditNote",
            allLabel: "Con y sin nota crédito",
            options: [
              { value: "si", label: "Con nota crédito" },
              { value: "no", label: "Sin nota crédito" },
            ],
          },
        ]}
        shown={filtered.length}
        total={rows.length}
        noun="devoluciones"
        summaryExtra={`Total: ${formatCurrency(filteredAmount)}`}
      />

      <SectionCard
        title="Devoluciones"
        description="Cada devolucion con factura asociada reduce el saldo de cartera del cliente."
      >
        <DataTable
          columns={columns}
          rows={filtered}
          getRowKey={(row) => row.id}
          emptyState={
            <EmptyState
              title="No hay devoluciones registradas"
              description="Registra una devolucion para ajustar la cartera del cliente."
              action={
                canCreate(role, "returns") && (
                  <ButtonLink href="/returns/new">Registrar devolucion</ButtonLink>
                )
              }
            />
          }
        />
      </SectionCard>
    </div>
  );
}
