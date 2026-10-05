import Link from "next/link";
import { DebtorsCsvButton } from "@/components/invoices/debtors-csv-button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ListFilters } from "@/components/ui/list-filters";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatCard } from "@/components/ui/stat-card";
import { apiFetch } from "@/lib/api.server";
import { bucketAging, type AgingInvoice } from "@/lib/debtor-aging";
import { applyFilters, type SearchParams } from "@/lib/list-filter";

interface DebtorsInvoiceApiItem {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customer: { id: string; displayName: string };
  dueDate: string;
  totalAmount: string | number;
  totalPaid: string | number;
  creditNoteTotal?: string | number | null;
  status: string;
}

interface DebtorTableRow {
  customerId: string;
  customerName: string;
  balance: number;
  current: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90plus: number;
  oldestDueDate: string;
  mora: "aldia" | "enmora";
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

const columns: readonly DataTableColumn<DebtorTableRow>[] = [
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
    key: "current",
    header: "Vigente",
    align: "right",
    render: (row) => formatCurrency(row.current),
  },
  {
    key: "d1_30",
    header: "1-30",
    align: "right",
    render: (row) => formatCurrency(row.d1_30),
  },
  {
    key: "d31_60",
    header: "31-60",
    align: "right",
    render: (row) => formatCurrency(row.d31_60),
  },
  {
    key: "d61_90",
    header: "61-90",
    align: "right",
    render: (row) => formatCurrency(row.d61_90),
  },
  {
    key: "d90plus",
    header: "+90",
    align: "right",
    render: (row) => formatCurrency(row.d90plus),
  },
  {
    key: "oldestDueDate",
    header: "Vto. mas antiguo",
    render: (row) => dateFormatter.format(new Date(row.oldestDueDate)),
  },
] as const;

export default async function DebtorsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  // Sin query: el DTO del API rechaza con 400 cualquier parametro no listado.
  const response = await apiFetch("/invoices");
  const invoices = (response.ok ? await response.json() : []) as DebtorsInvoiceApiItem[];

  const asOf = new Date().toISOString().slice(0, 10);
  const agingInput: AgingInvoice[] = invoices.map((invoice) => ({
    id: invoice.id,
    customerId: invoice.customerId,
    customerName: invoice.customer.displayName,
    totalAmount: invoice.totalAmount,
    totalPaid: invoice.totalPaid,
    creditNoteTotal: invoice.creditNoteTotal,
    dueDate: invoice.dueDate,
    status: invoice.status,
    invoiceNumber: invoice.invoiceNumber,
  }));

  const rows: DebtorTableRow[] = bucketAging(agingInput, asOf)
    .map((row) => ({
      ...row,
      mora: row.d1_30 + row.d31_60 + row.d61_90 + row.d90plus > 0 ? ("enmora" as const) : ("aldia" as const),
    }))
    .sort((a, b) => b.balance - a.balance);

  const filtered = applyFilters(rows, params, {
    search: (row) => [row.customerName],
    match: { mora: (row) => row.mora },
  });

  const totalBalance = filtered.reduce((sum, row) => sum + row.balance, 0);
  const totalOverdue = filtered.reduce(
    (sum, row) => sum + row.d1_30 + row.d31_60 + row.d61_90 + row.d90plus,
    0,
  );

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <PageHeader
        eyebrow="Cartera"
        title={`Deudores · ${rows.length}`}
        description="Saldos por cliente en buckets por dias de mora, al corte de hoy. Solo lectura: los saldos salen de facturas, pagos y notas credito."
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 16,
        }}
      >
        <StatCard
          label="Deudores"
          value={rows.length.toLocaleString("es-CO")}
          tone="info"
        />
        <StatCard
          label="Saldo pendiente"
          value={formatCurrency(rows.reduce((sum, row) => sum + row.balance, 0))}
          tone="warning"
        />
        <StatCard
          label="En mora"
          value={formatCurrency(
            rows.reduce(
              (sum, row) => sum + row.d1_30 + row.d31_60 + row.d61_90 + row.d90plus,
              0,
            ),
          )}
          tone="danger"
        />
      </div>

      <ListFilters
        searchPlaceholder="Buscar por cliente"
        selects={[
          {
            key: "mora",
            allLabel: "Al dia y en mora",
            options: [
              { value: "enmora", label: "En mora" },
              { value: "aldia", label: "Al día" },
            ],
          },
        ]}
        shown={filtered.length}
        total={rows.length}
        noun="deudores"
        summaryExtra={`Saldo pendiente: ${formatCurrency(totalBalance)} · En mora: ${formatCurrency(totalOverdue)}`}
      />

      <SectionCard
        title="Deudores"
        description="Cada cliente muestra su saldo total, lo vigente y lo vencido por tramos. El CSV trae lo que se esta viendo."
        actions={<DebtorsCsvButton rows={filtered} asOf={asOf} />}
      >
        <DataTable
          columns={columns}
          rows={filtered}
          getRowKey={(row) => row.customerId}
          emptyState={
            <EmptyState
              title="Sin deudores"
              description="No hay saldos pendientes al corte de hoy con los filtros aplicados."
            />
          }
        />
      </SectionCard>
    </div>
  );
}
