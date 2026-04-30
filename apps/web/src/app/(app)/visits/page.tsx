import Link from "next/link";
import { ButtonLink } from "@/components/ui/button-link";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { crmTheme, type CrmStatusTone } from "@/components/ui/theme";
import { apiFetch } from "@/lib/api.server";
import { getCurrentUser } from "@/lib/auth.server";
import { canCreate } from "@/lib/auth";

interface Customer {
  id: string;
  displayName: string;
}

interface Visit {
  id: string;
  customer: Customer | null;
  scheduledAt: string;
  summary: string;
  status: string;
}

interface VisitRow {
  id: string;
  customerName: string | null;
  customerId: string | null;
  scheduledAt: string;
  summary: string;
  status: string;
}

const statusLabels: Record<string, string> = {
  programada: "Programada",
  completada: "Completada",
  cancelada: "Cancelada",
  no_realizada: "No realizada",
};

const statusTones: Record<string, CrmStatusTone> = {
  programada: "warning",
  completada: "success",
  cancelada: "danger",
  no_realizada: "neutral",
};

const dateTimeFormatter = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
  timeStyle: "short",
});

const linkStyle = {
  color: "#2d6cdf",
  textDecoration: "none",
  fontWeight: 700,
} as const;

const columns: readonly DataTableColumn<VisitRow>[] = [
  {
    key: "customer",
    header: "Cliente",
    render: (row) => (
      <div style={{ display: "grid", gap: 4 }}>
        {row.customerId ? (
          <Link href={`/customers/${row.customerId}`} style={{ ...linkStyle, color: "#10233f" }}>
            {row.customerName}
          </Link>
        ) : (
          <span style={{ fontWeight: 700, color: "#10233f" }}>Sin cliente</span>
        )}
        <span style={{ fontSize: 13, color: "#52637a" }}>Visita #{row.id.slice(-6)}</span>
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
    key: "scheduledAt",
    header: "Agenda",
    render: (row) => dateTimeFormatter.format(new Date(row.scheduledAt)),
  },
  {
    key: "summary",
    header: "Resumen",
    render: (row) => (
      <span style={{ color: "#52637a" }}>
        {row.summary || "Sin resumen registrado"}
      </span>
    ),
  },
  {
    key: "detail",
    header: "Detalle",
    align: "right",
    render: (row) => (
      <Link href={`/visits/${row.id}`} style={linkStyle}>
        Abrir
      </Link>
    ),
  },
] as const;

function countByStatus(rows: VisitRow[], status: string) {
  return rows.filter((row) => row.status === status).length.toLocaleString("es-CO");
}

type FilterKey = "all" | "today" | "thisWeek" | "programada" | "completada" | "mine";

const filterConfig: { key: FilterKey; label: string; param?: string }[] = [
  { key: "all", label: "Todas" },
  { key: "today", label: "Hoy", param: "today=true" },
  { key: "thisWeek", label: "Esta semana", param: "thisWeek=true" },
  { key: "programada", label: "Programadas", param: "status=programada" },
  { key: "completada", label: "Completadas", param: "status=completada" },
  { key: "mine", label: "Mías", param: "assignedToMe=true" },
];

export default async function VisitsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const activeFilter = (typeof params.filter === "string" ? params.filter : "all") as FilterKey;

  const filterParam = filterConfig.find((f) => f.key === activeFilter)?.param;
  const apiPath = filterParam ? `/visits?${filterParam}` : "/visits";

  const response = await apiFetch(apiPath);
  const visits: Visit[] = response.ok ? await response.json() : [];

  const allResponse = await apiFetch("/visits");
  const allVisits: Visit[] = allResponse.ok ? await allResponse.json() : [];

  const user = await getCurrentUser();
  const userRole = user?.role ?? null;

  const rows: VisitRow[] = visits.map((visit) => ({
    id: visit.id,
    customerName: visit.customer?.displayName ?? null,
    customerId: visit.customer?.id ?? null,
    scheduledAt: visit.scheduledAt,
    summary: visit.summary,
    status: visit.status,
  }));

  const allRows: VisitRow[] = allVisits.map((visit) => ({
    id: visit.id,
    customerName: visit.customer?.displayName ?? null,
    customerId: visit.customer?.id ?? null,
    scheduledAt: visit.scheduledAt,
    summary: visit.summary,
    status: visit.status,
  }));

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <PageHeader
        eyebrow="Operación en campo"
        title="Visitas"
        description="Planea y revisa la ejecución comercial presencial con foco en agenda, cliente y resultado."
        actions={
          <>
            {canCreate(userRole, "visit") && <ButtonLink href="/visits/new">Nueva visita</ButtonLink>}
            <ButtonLink href="/follow-ups" variant="secondary">
              Ver seguimientos
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
        <StatCard label="Programadas" value={countByStatus(allRows, "programada")} tone="warning" />
        <StatCard label="Completadas" value={countByStatus(allRows, "completada")} tone="success" />
        <StatCard label="Canceladas" value={countByStatus(allRows, "cancelada")} tone="danger" />
        <StatCard label="No realizadas" value={countByStatus(allRows, "no_realizada")} tone="neutral" />
      </div>

      <FilterBar
        summary={`${rows.length.toLocaleString("es-CO")} visitas registradas`}
        actions={
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {filterConfig.map((f) => {
              const isActive = activeFilter === f.key;
              return (
                <Link
                  key={f.key}
                  href={f.key === "all" ? "/visits" : `/visits?filter=${f.key}`}
                  style={{
                    padding: "6px 12px",
                    borderRadius: crmTheme.radius.md,
                    background: isActive ? crmTheme.colors.primary : crmTheme.colors.surfaceMuted,
                    color: isActive ? "#fff" : crmTheme.colors.textMuted,
                    fontSize: 12,
                    fontWeight: 700,
                    textDecoration: "none",
                    transition: "background 160ms ease, color 160ms ease",
                  }}
                >
                  {f.label}
                </Link>
              );
            })}
          </div>
        }
      />

      <SectionCard
        title="Agenda de visitas"
        description="Mantén visibilidad de la programación, el cliente asociado y el estado operativo de cada visita."
      >
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.id}
          emptyState={
            <EmptyState
              title="No hay visitas registradas"
              description="Agenda la primera visita para empezar a estructurar la operación comercial en campo."
              action={canCreate(userRole, "visit") && <ButtonLink href="/visits/new">Crear visita</ButtonLink>}
            />
          }
        />
      </SectionCard>
    </div>
  );
}
