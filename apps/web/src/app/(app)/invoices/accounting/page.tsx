import { AccountingCsvButton } from "@/components/invoices/accounting-csv-button";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatCard } from "@/components/ui/stat-card";
import { apiFetch } from "@/lib/api.server";
import { summarizeAccounting, type AccountingInvoice } from "@/lib/accounting-report";

interface AccountingInvoiceApiItem {
  id: string;
  issueDate: string;
  status: string;
  subtotal: string | number;
  taxAmount: string | number;
  totalAmount: string | number;
  creditNoteTotal?: string | number | null;
  payments?: Array<{ paymentDate: string; amount: string | number }> | null;
}

interface TaxTableRow {
  rate: string;
  base: number;
  tax: number;
  total: number;
  count: number;
}

const currencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function formatCurrency(amount: number) {
  return currencyFormatter.format(amount);
}

const columns: readonly DataTableColumn<TaxTableRow>[] = [
  { key: "rate", header: "Concepto", render: (row) => row.rate },
  {
    key: "base",
    header: "Base",
    align: "right",
    render: (row) => formatCurrency(row.base),
  },
  {
    key: "tax",
    header: "Impuesto",
    align: "right",
    render: (row) => formatCurrency(row.tax),
  },
  {
    key: "total",
    header: "Total",
    align: "right",
    render: (row) => <strong>{formatCurrency(row.total)}</strong>,
  },
  {
    key: "count",
    header: "Facturas",
    align: "right",
    render: (row) => row.count.toLocaleString("es-CO"),
  },
] as const;

function isDay(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export default async function AccountingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;
  const rawFrom = Array.isArray(params.from) ? params.from[0] : params.from;
  const rawTo = Array.isArray(params.to) ? params.to[0] : params.to;
  let from = isDay(rawFrom) ? rawFrom : monthStart;
  let to = isDay(rawTo) ? rawTo : today;
  if (from > to) [from, to] = [to, from];

  // Sin query: se trae todo y el helper filtra por periodo, porque los pagos
  // se cuentan por fecha de pago aunque la factura sea de otro periodo.
  const response = await apiFetch("/invoices");
  const invoices = (response.ok ? await response.json() : []) as AccountingInvoiceApiItem[];

  const input: AccountingInvoice[] = invoices.map((invoice) => ({
    id: invoice.id,
    issueDate: invoice.issueDate,
    status: invoice.status,
    subtotal: invoice.subtotal,
    taxAmount: invoice.taxAmount,
    totalAmount: invoice.totalAmount,
    creditNoteTotal: invoice.creditNoteTotal,
    payments: invoice.payments,
  }));
  const summary = summarizeAccounting(input, from, to);

  const rows: TaxTableRow[] = [
    {
      rate: "Ventas IVA 0%",
      base: summary.salesByTax.rate0.base,
      tax: summary.salesByTax.rate0.tax,
      total: summary.salesByTax.rate0.total,
      count: summary.salesByTax.rate0.count,
    },
    {
      rate: "Ventas IVA 5%",
      base: summary.salesByTax.rate5.base,
      tax: summary.salesByTax.rate5.tax,
      total: summary.salesByTax.rate5.total,
      count: summary.salesByTax.rate5.count,
    },
  ];
  const salesTotal = rows.reduce((sum, row) => sum + row.total, 0);

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <PageHeader
        eyebrow="Cartera"
        title={`Contable · ${from} a ${to}`}
        description="Ventas por periodo con IVA discriminado, pagos recibidos y notas credito. Solo lectura, sin retenciones ni DIAN."
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 16,
        }}
      >
        <StatCard label="Ventas del periodo" value={formatCurrency(salesTotal)} tone="info" />
        <StatCard
          label="IVA discriminado"
          value={formatCurrency(summary.salesByTax.rate0.tax + summary.salesByTax.rate5.tax)}
          tone="info"
        />
        <StatCard
          label="Pagos recibidos"
          value={formatCurrency(summary.paymentsReceived)}
          tone="success"
        />
        <StatCard
          label="Notas credito"
          value={formatCurrency(summary.creditNotes)}
          tone="warning"
        />
      </div>

      <form
        method="get"
        style={{ display: "flex", alignItems: "end", gap: 12, flexWrap: "wrap" }}
      >
        <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
          Desde
          <input type="date" name="from" defaultValue={from} max={today} />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
          Hasta
          <input type="date" name="to" defaultValue={to} max={today} />
        </label>
        <Button type="submit" variant="outline">
          Aplicar
        </Button>
      </form>

      <SectionCard
        title="Ventas por tarifa"
        description="La tarifa se infiere por factura desde el impuesto: con impuesto va a 5%, sin impuesto a 0%. El CSV trae este resumen con pagos y notas."
        actions={<AccountingCsvButton summary={summary} from={from} to={to} />}
      >
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.rate}
          emptyState={
            <EmptyState
              title="Sin ventas"
              description="No hay facturas emitidas en el periodo seleccionado."
            />
          }
        />
      </SectionCard>
    </div>
  );
}
