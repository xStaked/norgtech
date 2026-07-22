import Link from "next/link";
import { ExpenseExportButtons } from "@/components/expenses/expense-export-buttons";
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
import { buildQueryString } from "@/lib/query-string";

interface ExpenseUser {
  id: string;
  name: string;
}

interface Customer {
  id: string;
  displayName: string;
}

interface Visit {
  id: string;
}

interface CommercialExpense {
  id: string;
  expenseDate: string;
  submittedBy: ExpenseUser;
  category: string;
  amount: string;
  currency: string;
  description: string | null;
  status: string;
  customer: Customer | null;
  visit: Visit | null;
}

interface ExpenseSummary {
  totalAmount?: number | string;
}

interface ExpenseRow {
  id: string;
  expenseDate: string;
  submittedByName: string;
  category: string;
  amount: number;
  currency: string;
  status: string;
  customerId: string | null;
  customerName: string | null;
  visitId: string | null;
}

const statusLabels: Record<string, string> = {
  pendiente: "Pendiente",
  requiere_correccion: "En correccion",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
  contabilizado: "Contabilizado",
};

const statusTones: Record<string, CrmStatusTone> = {
  pendiente: "warning",
  requiere_correccion: "danger",
  aprobado: "success",
  rechazado: "danger",
  contabilizado: "info",
};

const categoryLabels: Record<string, string> = {
  alimentacion: "Alimentacion",
  transporte: "Transporte",
  hospedaje: "Hospedaje",
  combustible: "Combustible",
  peajes: "Peajes",
  parqueadero: "Parqueadero",
  atencion_comercial: "Cliente / atencion comercial",
  otros: "Otros",
};

const dateFormatter = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const linkStyle = {
  color: "#0f5c8a",
  textDecoration: "none",
  fontWeight: 700,
} as const;

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function countByStatus(rows: ExpenseRow[], status: string) {
  return rows.filter((row) => row.status === status).length.toLocaleString("es-CO");
}

function canExportExpenses(role: UserRole | null) {
  return role === "administrador" || role === "director_comercial" || role === "facturacion";
}

const columns: readonly DataTableColumn<ExpenseRow>[] = [
  {
    key: "date",
    header: "Fecha",
    render: (row) => dateFormatter.format(new Date(row.expenseDate)),
  },
  {
    key: "commercial",
    header: "Comercial",
    render: (row) => <strong style={{ color: "#0c2c44" }}>{row.submittedByName}</strong>,
  },
  {
    key: "category",
    header: "Categoria",
    render: (row) => categoryLabels[row.category] ?? row.category,
  },
  {
    key: "amount",
    header: "Monto",
    align: "right",
    render: (row) => <strong>{formatCurrency(row.amount, row.currency)}</strong>,
  },
  {
    key: "context",
    header: "Contexto",
    render: (row) => (
      <div style={{ display: "grid", gap: 4 }}>
        {row.customerId ? (
          <Link href={`/customers/${row.customerId}`} style={linkStyle}>
            {row.customerName}
          </Link>
        ) : (
          <span style={{ color: "#6b7787" }}>Sin cliente</span>
        )}
        {row.visitId ? (
          <Link href={`/visits/${row.visitId}`} style={{ ...linkStyle, fontSize: 13 }}>
            Visita #{row.visitId.slice(-6)}
          </Link>
        ) : (
          <span style={{ fontSize: 13, color: "#6b7787" }}>Sin visita</span>
        )}
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
    key: "detail",
    header: "Detalle",
    align: "right",
    render: (row) => (
      <Link href={`/expenses/${row.id}`} style={linkStyle}>
        Abrir
      </Link>
    ),
  },
] as const;

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const queryString = buildQueryString(params);
  const listPath = queryString ? `/commercial-expenses?${queryString}` : "/commercial-expenses";
  const summaryPath = queryString ? `/commercial-expenses/summary?${queryString}` : "/commercial-expenses/summary";

  const [response, summaryResponse, user] = await Promise.all([
    apiFetch(listPath),
    apiFetch(summaryPath),
    getCurrentUser(),
  ]);

  const expenses: CommercialExpense[] = response.ok ? await response.json() : [];
  const summary: ExpenseSummary = summaryResponse.ok ? await summaryResponse.json() : {};
  const role = user?.role ?? null;

  const rows: ExpenseRow[] = expenses.map((expense) => ({
    id: expense.id,
    expenseDate: expense.expenseDate,
    submittedByName: expense.submittedBy.name,
    category: expense.category,
    amount: Number(expense.amount),
    currency: expense.currency,
    status: expense.status,
    customerId: expense.customer?.id ?? null,
    customerName: expense.customer?.displayName ?? null,
    visitId: expense.visit?.id ?? null,
  }));

  const totalAmount = Number(summary.totalAmount ?? rows.reduce((total, row) => total + row.amount, 0));
  const filterSummary = `${rows.length.toLocaleString("es-CO")} gastos registrados - ${formatCurrency(totalAmount, "COP")} reportados`;

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <PageHeader
        eyebrow="Control en campo"
        title="Gastos comerciales"
        description="Registro, revision contable y resumen mensual por vendedor."
        actions={
          <>
            {canCreate(role, "expense") && <ButtonLink href="/expenses/new">Nuevo gasto</ButtonLink>}
            {canExportExpenses(role) && <ExpenseExportButtons query={params} />}
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
        <StatCard label="Pendientes" value={countByStatus(rows, "pendiente")} tone="warning" />
        <StatCard label="En correccion" value={countByStatus(rows, "requiere_correccion")} tone="danger" />
        <StatCard label="Aprobados" value={countByStatus(rows, "aprobado")} tone="success" />
        <StatCard label="Contabilizados" value={countByStatus(rows, "contabilizado")} tone="info" />
      </div>

      <FilterBar summary={filterSummary} />

      <SectionCard
        title="Cola de gastos"
        description="Revisa fecha, vendedor, categoria, soporte operativo y estado contable de cada gasto."
      >
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.id}
          emptyState={
            <EmptyState
              title="No hay gastos registrados"
              description="Registra el primer gasto para iniciar el control de soportes y revision contable."
              action={canCreate(role, "expense") && <ButtonLink href="/expenses/new">Crear gasto</ButtonLink>}
            />
          }
        />
      </SectionCard>
    </div>
  );
}
