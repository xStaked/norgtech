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
import type { CrmStatusTone } from "@/components/ui/theme";
import { apiFetch } from "@/lib/api.server";
import { getCurrentUser } from "@/lib/auth.server";
import { canCreate } from "@/lib/auth";

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
        <Link href={`/opportunities/${row.id}`} style={{ fontWeight: 700, color: "#0c2c44", textDecoration: "none" }}>
          {row.title}
        </Link>
        <span style={{ fontSize: 13, color: "#44556e" }}>ID {row.id.slice(-8)}</span>
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
        <Link href={`/customers/${row.customerId}`} style={{ color: "#0f5c8a", textDecoration: "none", fontWeight: 600 }}>
          {row.customerName}
        </Link>
      ) : (
        <span style={{ color: "#6b7787" }}>Sin cliente</span>
      ),
  },
  {
    key: "value",
    header: "Valor estimado",
    align: "right",
    render: (row) =>
      row.estimatedValue !== null ? currencyFormatter.format(row.estimatedValue) : (
        <span style={{ color: "#6b7787" }}>Sin estimación</span>
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
      <Link href={`/opportunities/${row.id}`} style={{ color: "#0f5c8a", textDecoration: "none", fontWeight: 700 }}>
        Abrir
      </Link>
    ),
  },
] as const;

function countByStage(rows: OpportunityRow[], stage: string) {
  return rows.filter((row) => row.stage === stage).length.toLocaleString("es-CO");
}

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const userRole = user?.role ?? null;

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

  // Los StatCard resumen todo el pipeline; los filtros solo recortan la tabla.
  const filtered = applyFilters(rows, params, {
    search: (row) => [row.title, row.customerName],
    match: { stage: (row) => row.stage },
  });

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <PageHeader
        eyebrow="Flujo comercial"
        title="Oportunidades"
        description="Pipeline activo por etapa con foco en avance, monto y contexto del cliente."
        actions={
          <>
            {canCreate(userRole, "opportunity") && (
              <ButtonLink href="/opportunities/new">Nueva oportunidad</ButtonLink>
            )}
            {canCreate(userRole, "quote") && (
              <ButtonLink href="/quotes/new" variant="secondary">
                Nueva cotización
              </ButtonLink>
            )}
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

      <ListFilters
        searchPlaceholder="Buscar por título o cliente"
        selects={[
          {
            key: "stage",
            allLabel: "Todas las etapas",
            options: Object.entries(stageLabels).map(([value, label]) => ({ value, label })),
          },
        ]}
        shown={filtered.length}
        total={rows.length}
        noun="oportunidades"
      />

      <SectionCard
        title="Pipeline comercial"
        description="Seguimiento compacto de etapa, cliente y valor estimado para priorizar el trabajo diario."
      >
        <DataTable
          columns={columns}
          rows={filtered}
          getRowKey={(row) => row.id}
          emptyState={
            <EmptyState
              title="No hay oportunidades registradas"
              description="Crea la primera oportunidad para empezar a mover el pipeline comercial."
              action={canCreate(userRole, "opportunity") && <ButtonLink href="/opportunities/new">Crear oportunidad</ButtonLink>}
            />
          }
        />
      </SectionCard>
    </div>
  );
}
