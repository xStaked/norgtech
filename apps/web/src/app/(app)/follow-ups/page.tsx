import Link from "next/link";
import { ButtonLink } from "@/components/ui/button-link";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ListFilters } from "@/components/ui/list-filters";
import { applyFilters, param, type SearchParams } from "@/lib/list-filter";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import type { CrmStatusTone } from "@/components/ui/theme";
import { apiFetch } from "@/lib/api.server";
import { dateTimeFormatter, isSameDayInBogota } from "@/lib/datetime";
import { getCurrentUser } from "@/lib/auth.server";
import { canCreate } from "@/lib/auth";

interface Customer {
  id: string;
  displayName: string;
}

interface FollowUpTask {
  id: string;
  customer: Customer | null;
  dueAt: string;
  title: string;
  type: string;
  status: string;
  /** Derivado por el API con la regla compartida. El front no lo recalcula. */
  isOverdue: boolean;
}

interface FollowUpRow {
  id: string;
  customerName: string | null;
  customerId: string | null;
  dueAt: string;
  title: string;
  type: string;
  status: string;
  isOverdue: boolean;
}

const statusLabels: Record<string, string> = {
  pendiente: "Pendiente",
  completada: "Completada",
  vencida: "Vencida",
};

const statusTones: Record<string, CrmStatusTone> = {
  pendiente: "warning",
  completada: "success",
  vencida: "danger",
};

const typeLabels: Record<string, string> = {
  llamada: "Llamada",
  email: "Email",
  whatsapp: "WhatsApp",
  reunion: "Reunión",
  recordatorio: "Recordatorio",
  otro: "Otro",
};


const linkStyle = {
  color: "#0f5c8a",
  textDecoration: "none",
  fontWeight: 700,
} as const;

const columns: readonly DataTableColumn<FollowUpRow>[] = [
  {
    key: "task",
    header: "Tarea",
    render: (row) => (
      <div style={{ display: "grid", gap: 4 }}>
        <Link href={`/follow-ups/${row.id}`} style={{ fontWeight: 700, color: "#0c2c44", textDecoration: "none" }}>
          {row.title}
        </Link>
        <span style={{ fontSize: 13, color: "#44556e" }}>{typeLabels[row.type] ?? row.type}</span>
      </div>
    ),
  },
  {
    key: "status",
    header: "Estado",
    render: (row) => {
      // "Vencida" es estado derivado: una tarea pendiente cuya fecha ya paso lo
      // esta, aunque su columna siga diciendo "pendiente" (nadie la reescribe).
      const label = row.isOverdue ? "Vencida" : statusLabels[row.status] ?? row.status;
      const tone = row.isOverdue ? "danger" : statusTones[row.status] ?? "neutral";
      return <StatusBadge tone={tone}>{label}</StatusBadge>;
    },
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
        <span style={{ color: "#6b7787" }}>Sin cliente</span>
      ),
  },
  {
    key: "dueAt",
    header: "Vence",
    render: (row) => dateTimeFormatter.format(new Date(row.dueAt)),
  },
  {
    key: "detail",
    header: "Detalle",
    align: "right",
    render: (row) => (
      <Link href={`/follow-ups/${row.id}`} style={linkStyle}>
        Abrir
      </Link>
    ),
  },
] as const;

function countByStatus(rows: FollowUpRow[], status: string) {
  return rows.filter((row) => row.status === status).length.toLocaleString("es-CO");
}

function countOverdue(rows: FollowUpRow[]) {
  return rows.filter((row) => row.isOverdue).length.toLocaleString("es-CO");
}

function countDueToday(rows: FollowUpRow[]) {
  return rows
    .filter((row) => isSameDayInBogota(row.dueAt, new Date()))
    .length.toLocaleString("es-CO");
}

type FilterKey = "all" | "pendiente" | "vencida" | "completada" | "dueToday" | "mine";

const filterConfig: { key: FilterKey; label: string; param?: string }[] = [
  { key: "all", label: "Todas" },
  { key: "pendiente", label: "Pendientes", param: "status=pendiente" },
  { key: "vencida", label: "Vencidas", param: "overdue=true" },
  { key: "completada", label: "Completadas", param: "status=completada" },
  { key: "dueToday", label: "Vencen hoy", param: "dueToday=true" },
  { key: "mine", label: "Mías", param: "assignedToMe=true" },
];

export default async function FollowUpsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const activeFilter = (param(params, "filter") ?? "all") as FilterKey;

  const filterParam = filterConfig.find((f) => f.key === activeFilter)?.param;
  const apiPath = filterParam ? `/follow-up-tasks?${filterParam}` : "/follow-up-tasks";

  const response = await apiFetch(apiPath);
  const tasks: FollowUpTask[] = response.ok ? await response.json() : [];

  const allResponse = await apiFetch("/follow-up-tasks");
  const allTasks: FollowUpTask[] = allResponse.ok ? await allResponse.json() : [];

  const user = await getCurrentUser();
  const userRole = user?.role ?? null;

  const rows: FollowUpRow[] = tasks.map((task) => ({
    id: task.id,
    customerName: task.customer?.displayName ?? null,
    customerId: task.customer?.id ?? null,
    dueAt: task.dueAt,
    title: task.title,
    type: task.type,
    status: task.status,
    isOverdue: task.isOverdue,
  }));

  const allRows: FollowUpRow[] = allTasks.map((task) => ({
    id: task.id,
    customerName: task.customer?.displayName ?? null,
    customerId: task.customer?.id ?? null,
    dueAt: task.dueAt,
    title: task.title,
    type: task.type,
    status: task.status,
    isOverdue: task.isOverdue,
  }));

  // El filtro rapido ya viene aplicado del API; la busqueda recorta aqui.
  const filtered = applyFilters(rows, params, {
    search: (row) => [row.title, row.customerName],
  });

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <PageHeader
        eyebrow="Gestión comercial"
        title="Seguimientos"
        description="Centraliza tareas pendientes por cliente, canal y vencimiento para priorizar el trabajo diario."
        actions={
          <>
            {canCreate(userRole, "followUp") && <ButtonLink href="/follow-ups/new">Nueva tarea</ButtonLink>}
            <ButtonLink href="/visits" variant="secondary">
              Ver visitas
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
        <StatCard label="Pendientes" value={countByStatus(allRows, "pendiente")} tone="warning" />
        <StatCard label="Vencidas" value={countOverdue(allRows)} tone="danger" />
        <StatCard label="Completadas" value={countByStatus(allRows, "completada")} tone="success" />
        <StatCard label="Vencen hoy" value={countDueToday(allRows)} tone="info" />
      </div>

      <ListFilters
        searchPlaceholder="Buscar por título o cliente"
        selects={[
          {
            key: "filter",
            allLabel: "Todas",
            options: filterConfig
              .filter((f) => f.key !== "all")
              .map((f) => ({ value: f.key, label: f.label })),
          },
        ]}
        shown={filtered.length}
        noun="tareas"
      />

      <SectionCard
        title="Cola de seguimientos"
        description="Revisa rápidamente qué tarea sigue, para quién es y cuándo debe resolverse."
      >
        <DataTable
          columns={columns}
          rows={filtered}
          getRowKey={(row) => row.id}
          emptyState={
            <EmptyState
              title="No hay tareas de seguimiento registradas"
              description="Crea la primera tarea para empezar a ordenar la cola comercial pendiente."
              action={canCreate(userRole, "followUp") && <ButtonLink href="/follow-ups/new">Crear tarea</ButtonLink>}
            />
          }
        />
      </SectionCard>
    </div>
  );
}
