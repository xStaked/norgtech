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
import { getCurrentUser } from "@/lib/auth.server";
import { canCreate } from "@/lib/auth";

interface Customer {
  id: string;
  displayName: string;
}

interface Quote {
  id: string;
  status: string;
  subtotal: string;
  total: string;
  customer: Customer | null;
  createdAt: string;
}

interface QuoteRow {
  id: string;
  status: string;
  subtotal: number;
  total: number;
  customerName: string | null;
  customerId: string | null;
  createdAt: string;
}

const statusLabels: Record<string, string> = {
  abierta: "Abierta",
  en_negociacion: "En negociación",
  cerrada: "Cerrada",
  perdida: "Perdida",
};

const statusTones: Record<string, CrmStatusTone> = {
  abierta: "info",
  en_negociacion: "warning",
  cerrada: "success",
  perdida: "danger",
};

const currencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const linkStyle = {
  color: "#2d6cdf",
  textDecoration: "none",
  fontWeight: 700,
} as const;

const columns: readonly DataTableColumn<QuoteRow>[] = [
  {
    key: "quote",
    header: "Cotización",
    render: (row) => (
      <div style={{ display: "grid", gap: 4 }}>
        <Link href={`/quotes/${row.id}`} style={{ fontWeight: 700, color: "#10233f", textDecoration: "none" }}>
          Cotización #{row.id.slice(-6)}
        </Link>
        <span style={{ fontSize: 13, color: "#52637a" }}>{dateFormatter.format(new Date(row.createdAt))}</span>
      </div>
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
  {
    key: "customer",
    header: "Cliente",
    render: (row) =>
      row.customerId ? (
        <Link href={`/customers/${row.customerId}`} style={linkStyle}>
          {row.customerName}
        </Link>
      ) : (
        <span style={{ color: "#6b7c93" }}>Sin cliente</span>
      ),
  },
  {
    key: "subtotal",
    header: "Subtotal",
    align: "right",
    render: (row) => currencyFormatter.format(row.subtotal),
  },
  {
    key: "total",
    header: "Total",
    align: "right",
    render: (row) => <strong>{currencyFormatter.format(row.total)}</strong>,
  },
  {
    key: "detail",
    header: "Detalle",
    align: "right",
    render: (row) => (
      <Link href={`/quotes/${row.id}`} style={linkStyle}>
        Abrir
      </Link>
    ),
  },
] as const;

function countByStatus(rows: QuoteRow[], status: string) {
  return rows.filter((row) => row.status === status).length.toLocaleString("es-CO");
}

function sumTotals(rows: QuoteRow[]) {
  return currencyFormatter.format(rows.reduce((sum, row) => sum + row.total, 0));
}

export default async function QuotesPage() {
  const user = await getCurrentUser();
  const userRole = user?.role ?? null;

  const response = await apiFetch("/quotes");
  const quotes: Quote[] = response.ok ? await response.json() : [];

  const rows: QuoteRow[] = quotes.map((quote) => ({
    id: quote.id,
    status: quote.status,
    subtotal: Number(quote.subtotal),
    total: Number(quote.total),
    customerName: quote.customer?.displayName ?? null,
    customerId: quote.customer?.id ?? null,
    createdAt: quote.createdAt,
  }));

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <PageHeader
        eyebrow="Propuestas comerciales"
        title="Cotizaciones"
        description="Vista consolidada de propuestas vigentes, valor cotizado y avance hacia cierre comercial."
        actions={
          <>
            {canCreate(userRole, "quote") && <ButtonLink href="/quotes/new">Nueva cotización</ButtonLink>}
            <ButtonLink href="/opportunities" variant="secondary">
              Ver oportunidades
            </ButtonLink>
          </>
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
        }}
      >
        <StatCard label="Abiertas" value={countByStatus(rows, "abierta")} tone="info" />
        <StatCard label="En negociación" value={countByStatus(rows, "en_negociacion")} tone="warning" />
        <StatCard label="Cerradas" value={countByStatus(rows, "cerrada")} tone="success" />
        <StatCard label="Valor total" value={sumTotals(rows)} tone="neutral" />
      </div>

      <FilterBar summary={`${rows.length.toLocaleString("es-CO")} cotizaciones registradas`} />

      <SectionCard
        title="Pipeline de cotizaciones"
        description="Consulta estado, cliente y valor total de cada propuesta desde una sola vista operativa."
      >
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.id}
          emptyState={
            <EmptyState
              title="No hay cotizaciones registradas"
              description="Crea la primera cotización para empezar a consolidar propuestas comerciales."
              action={canCreate(userRole, "quote") && <ButtonLink href="/quotes/new">Crear cotización</ButtonLink>}
            />
          }
        />
      </SectionCard>
    </div>
  );
}
