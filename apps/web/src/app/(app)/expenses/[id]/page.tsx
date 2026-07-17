import Link from "next/link";
import { notFound } from "next/navigation";
import { ExpenseForm } from "@/components/expenses/expense-form";
import { formatPercent } from "@/lib/labels";
import { ExpenseStatusAction } from "@/components/expenses/expense-status-action";
import { ExpenseSupportLink } from "@/components/expenses/expense-support-link";
import { ButtonLink } from "@/components/ui/button-link";
import { DetailSection } from "@/components/ui/detail-section";
import { InlineMetric } from "@/components/ui/inline-metric";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import type { CrmStatusTone } from "@/components/ui/theme";
import { apiFetch } from "@/lib/api.server";
import { getCurrentUser } from "@/lib/auth.server";

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
  summary?: string;
  scheduledAt?: string;
  customerId: string | null;
}

interface ExpenseSupport {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

interface CommercialExpense {
  id: string;
  expenseDate: string;
  submittedBy: ExpenseUser;
  reviewedBy: ExpenseUser | null;
  category: string;
  amount: string;
  currency: string;
  description: string;
  status: string;
  reviewNote: string | null;
  reviewedAt: string | null;
  supplierName: string | null;
  supplierNit: string | null;
  invoiceNumber: string | null;
  paymentMethod: string | null;
  extractionConfidence: string | null;
  extractionModel: string | null;
  extractionReviewedAt: string | null;
  customer: Customer | null;
  visit: Visit | null;
  supports: ExpenseSupport[];
  createdAt: string;
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
  dateStyle: "medium",
});

const dateTimeFormatter = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
  timeStyle: "short",
});

const linkStyle = {
  color: "#0c2c44",
  fontWeight: 700,
  textDecoration: "none",
} as const;

function formatCurrency(amount: string, currency: string) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount));
}

function formatBytes(sizeBytes: number) {
  if (sizeBytes >= 1024 * 1024) return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  if (sizeBytes >= 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${sizeBytes} B`;
}

function canReview(role: string | null) {
  return role === "administrador" || role === "director_comercial" || role === "facturacion";
}

function canEditExpense(userId: string | null, role: string | null, expense: CommercialExpense) {
  if (expense.status !== "pendiente" && expense.status !== "requiere_correccion") return false;
  if (role === "administrador" || role === "director_comercial" || role === "facturacion") return true;
  return userId === expense.submittedBy.id;
}

export default async function ExpenseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const expenseRes = await apiFetch(`/commercial-expenses/${id}`);

  if (!expenseRes.ok) {
    notFound();
  }

  const expense: CommercialExpense = await expenseRes.json();
  const [user, customersRes, visitsRes] = await Promise.all([
    getCurrentUser(),
    apiFetch("/customers"),
    apiFetch("/visits"),
  ]);
  const customers: Customer[] = customersRes.ok ? await customersRes.json() : [];
  const visits: Visit[] = visitsRes.ok ? await visitsRes.json() : [];
  const role = user?.role ?? null;
  const canEdit = canEditExpense(user?.id ?? null, role, expense);

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <PageHeader
        eyebrow="Gastos comerciales"
        title={`${categoryLabels[expense.category] ?? expense.category} ${formatCurrency(expense.amount, expense.currency)}`}
        description="Detalle del gasto, soporte y trazabilidad de revision."
        actions={
          <>
            <StatusBadge tone={statusTones[expense.status] ?? "neutral"}>
              {statusLabels[expense.status] ?? expense.status}
            </StatusBadge>
            <ButtonLink href="/expenses" variant="ghost" size="sm">
              Volver a gastos
            </ButtonLink>
          </>
        }
      />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <InlineMetric label="Monto" value={formatCurrency(expense.amount, expense.currency)} tone="info" />
        <InlineMetric label="Fecha" value={dateFormatter.format(new Date(expense.expenseDate))} />
        <InlineMetric label="Registro" value={`#${expense.id.slice(-6)}`} />
      </div>

      <DetailSection
        title="Informacion del gasto"
        description="Contexto comercial y estado actual para validar el desembolso."
        fields={[
          { label: "Comercial", value: expense.submittedBy.name },
          { label: "Categoria", value: categoryLabels[expense.category] ?? expense.category },
          {
            label: "Cliente",
            value: expense.customer ? (
              <Link href={`/customers/${expense.customer.id}`} style={linkStyle}>
                {expense.customer.displayName}
              </Link>
            ) : (
              "Sin cliente"
            ),
          },
          {
            label: "Visita",
            value: expense.visit ? (
              <Link href={`/visits/${expense.visit.id}`} style={linkStyle}>
                {expense.visit.summary ?? `Visita #${expense.visit.id.slice(-6)}`}
              </Link>
            ) : (
              "Sin visita"
            ),
          },
          { label: "Descripcion", value: expense.description },
          { label: "Proveedor", value: expense.supplierName ?? "Sin proveedor" },
          { label: "NIT", value: expense.supplierNit ?? "Sin NIT" },
          { label: "Numero factura", value: expense.invoiceNumber ?? "Sin numero" },
          { label: "Medio de pago", value: expense.paymentMethod ?? "Sin medio de pago" },
          {
            label: "IA",
            value: expense.extractionConfidence
              ? `${formatPercent(Number(expense.extractionConfidence) * 100)} (${expense.extractionModel ?? "modelo no registrado"})`
              : "Sin lectura IA",
          },
          {
            label: "Creado",
            value: dateTimeFormatter.format(new Date(expense.createdAt)),
          },
        ]}
      />

      <DetailSection
        title="Revision"
        description="Estado contable, notas de devolucion y acciones disponibles."
        fields={[
          {
            label: "Estado",
            value: (
              <StatusBadge tone={statusTones[expense.status] ?? "neutral"}>
                {statusLabels[expense.status] ?? expense.status}
              </StatusBadge>
            ),
          },
          { label: "Revisado por", value: expense.reviewedBy?.name ?? "Sin revision" },
          {
            label: "Fecha revision",
            value: expense.reviewedAt ? dateTimeFormatter.format(new Date(expense.reviewedAt)) : "Sin revision",
          },
          { label: "Nota", value: expense.reviewNote ?? "Sin nota" },
        ]}
        aside={<ExpenseStatusAction id={expense.id} currentStatus={expense.status} canChange={canReview(role)} />}
      />

      <SectionCard title="Soportes" description="Archivos cargados como evidencia del gasto.">
        <div className="grid gap-3">
          {expense.supports.map((support) => (
            <div key={support.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div>
                <div className="text-sm font-semibold text-foreground">{support.fileName}</div>
                <div className="text-xs text-muted-foreground">
                  {support.contentType} - {formatBytes(support.sizeBytes)}
                </div>
              </div>
              <ExpenseSupportLink expenseId={expense.id} supportId={support.id} fileName="Abrir soporte" />
            </div>
          ))}
        </div>
      </SectionCard>

      {canEdit ? (
        <SectionCard
          title={expense.status === "requiere_correccion" ? "Corregir gasto" : "Editar gasto"}
          description="Al corregir un gasto devuelto, el estado vuelve a pendiente para nueva revision."
        >
          <ExpenseForm
            customers={customers}
            visits={visits}
            initialValues={{
              id: expense.id,
              expenseDate: expense.expenseDate,
              category: expense.category,
              amount: expense.amount,
              description: expense.description,
              customerId: expense.customer?.id ?? null,
              visitId: expense.visit?.id ?? null,
              supplierName: expense.supplierName,
              supplierNit: expense.supplierNit,
              invoiceNumber: expense.invoiceNumber,
              paymentMethod: expense.paymentMethod,
              extractionConfidence: expense.extractionConfidence,
              extractionModel: expense.extractionModel,
            }}
          />
        </SectionCard>
      ) : null}
    </div>
  );
}
