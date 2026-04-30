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

interface Customer {
  id: string;
  displayName: string;
}

interface Opportunity {
  id: string;
  title: string;
  stage: string;
  estimatedValue: string | null;
  customer: Customer | null;
  createdAt: string;
}

interface OpportunityRow {
  id: string;
  title: string;
  stage: string;
  estimatedValue: number | null;
  customerName: string | null;
  customerId: string | null;
  createdAt: string;
}

const stageLabels: Record<string, string> = {
  prospecto: "Prospecto",
  contacto: "Contacto",
  visita: "Visita",
  cotizacion: "Cotización",
  negociacion: "Negociación",
  orden_facturacion: "Orden de facturación",
  venta_cerrada: "Venta cerrada",
  perdida: "Perdida",
};

const stageTones: Record<string, CrmStatusTone> = {
  prospecto: "neutral",
  contacto: "info",
  visita: "info",
  cotizacion: "warning",
  negociacion: "warning",
  orden_facturacion: "success",
  venta_cerrada: "success",
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

const columns: readonly DataTableColumn<OpportunityRow>[] = [
  {
    key: "opportunity",
    header: "Oportunidad",
    render: (row) => (
      <div style={{ display: "grid", gap: 4 }}>
        <Link href={`/opportunities/${row.id}`} style={{ fontWeight: 700, color: "#10233f", textDecoration: "none" }}>
          {row.title}
        </Link>
        <span style={{ fontSize: 13, color: "#52637a" }}>ID {row.id.slice(-8)}</span>
      </div>
    ),
  },
  {
    key: "stage",
    header: "Etapa",
    render: (row) => (
      <StatusBadge tone={stageTones[row.stage] ?? "neutral"}>
        {stageLabels[row.stage] ?? row.stage}
      </StatusBadge>
    ),
  },
  {
    key: "customer",
    header: "Cliente",
    render: (row) =>
      row.customerId ? (
        <Link href={`/customers/${row.customerId}`} style={{ color: "#2d6cdf", textDecoration: "none", fontWeight: 600 }}>
          {row.customerName}
        </Link>
      ) : (
        <span style={{ color: "#6b7c93" }}>Sin cliente</span>
      ),
  },
  {
    key: "value",
    header: "Valor estimado",
    align: "right",
    render: (row) =>
      row.estimatedValue !== null ? currencyFormatter.format(row.estimatedValue) : (
        <span style={{ color: "#6b7c93" }}>Sin estimación</span>
      ),
  },
  {
    key: "created",
    header: "Creada",
    render: (row) => dateFormatter.format(new Date(row.createdAt)),
  },
  {
    key: "detail",
    header: "Detalle",
    align: "right",
    render: (row) => (
      <Link href={`/opportunities/${row.id}`} style={{ color: "#2d6cdf", textDecoration: "none", fontWeight: 700 }}>
        Abrir
      </Link>
    ),
  },
] as const;

function countByStage(rows: OpportunityRow[], stage: string) {
  return rows.filter((row) => row.stage === stage).length.toLocaleString("es-CO");
}

export default async function OpportunitiesPage() {
  const response = await apiFetch("/opportunities");
  const opportunities: Opportunity[] = response.ok ? await response.json() : [];

  const rows: OpportunityRow[] = opportunities.map((opportunity) => ({
    id: opportunity.id,
    title: opportunity.title,
    stage: opportunity.stage,
    estimatedValue: opportunity.estimatedValue ? Number(opportunity.estimatedValue) : null,
    customerName: opportunity.customer?.displayName ?? null,
    customerId: opportunity.customer?.id ?? null,
    createdAt: opportunity.createdAt,
  }));

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <PageHeader
        eyebrow="Flujo comercial"
        title="Oportunidades"
        description="Pipeline activo por etapa con foco en avance, monto y contexto del cliente."
        actions={
          <>
            <ButtonLink href="/opportunities/new">Nueva oportunidad</ButtonLink>
            <ButtonLink href="/quotes/new" variant="secondary">
              Nueva cotización
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
        <StatCard label="Prospectos" value={countByStage(rows, "prospecto")} tone="neutral" />
        <StatCard label="En contacto" value={countByStage(rows, "contacto")} tone="info" />
        <StatCard label="En negociación" value={countByStage(rows, "negociacion")} tone="warning" />
        <StatCard label="Ventas cerradas" value={countByStage(rows, "venta_cerrada")} tone="success" />
      </div>

      <FilterBar summary={`${rows.length.toLocaleString("es-CO")} oportunidades en el pipeline`} />

      <SectionCard
        title="Pipeline comercial"
        description="Seguimiento compacto de etapa, cliente y valor estimado para priorizar el trabajo diario."
      >
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.id}
          emptyState={
            <EmptyState
              title="No hay oportunidades registradas"
              description="Crea la primera oportunidad para empezar a mover el pipeline comercial."
              action={<ButtonLink href="/opportunities/new">Crear oportunidad</ButtonLink>}
            />
          }
        />
      </SectionCard>
    </div>
  );
}
