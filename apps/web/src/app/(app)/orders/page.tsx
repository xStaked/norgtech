import Link from "next/link";
import { ButtonLink } from "@/components/ui/button-link";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ListFilters } from "@/components/ui/list-filters";
import { applyFilters, optionsFrom, param, type SearchParams } from "@/lib/list-filter";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import type { CrmStatusTone } from "@/components/ui/theme";
import { apiFetch } from "@/lib/api.server";
import { getCurrentUser } from "@/lib/auth.server";
import { canAccess, canCreate } from "@/lib/auth";

interface Customer {
  id: string;
  displayName: string;
}

interface Order {
  id: string;
  status: string;
  subtotal: string;
  total: string;
  committedDeliveryDate: string | null;
  customer: Customer | null;
  company: { id: string; name: string; prefix: string } | null;
  createdAt: string;
}

interface OrderRow {
  id: string;
  status: string;
  subtotal: number;
  total: number;
  customerName: string | null;
  customerId: string | null;
  companyName: string | null;
  companyPrefix: string | null;
  committedDeliveryDate: string | null;
  createdAt: string;
}

const statusLabels: Record<string, string> = {
  recibido: "Recibido",
  orden_facturacion: "Orden de facturación",
  facturado: "Facturado",
  despachado: "Despachado",
  en_transito: "En tránsito",
  entregado: "Entregado",
};

const statusTones: Record<string, CrmStatusTone> = {
  recibido: "info",
  orden_facturacion: "warning",
  facturado: "neutral",
  despachado: "info",
  en_transito: "warning",
  entregado: "success",
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

const columns: readonly DataTableColumn<OrderRow>[] = [
  {
    key: "order",
    header: "Pedido",
    render: (row) => (
      <div style={{ display: "grid", gap: 4 }}>
        <Link href={`/orders/${row.id}`} style={{ fontWeight: 700, color: "#0c2c44", textDecoration: "none" }}>
          Pedido #{row.id.slice(-6)}
        </Link>
        <span style={{ fontSize: 13, color: "#44556e" }}>{dateFormatter.format(new Date(row.createdAt))}</span>
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
        <Link href={`/customers/${row.customerId}`} style={{ color: "#0f5c8a", textDecoration: "none", fontWeight: 600 }}>
          {row.customerName}
        </Link>
      ) : (
        <span style={{ color: "#6b7787" }}>Sin cliente</span>
      ),
  },
  {
    key: "committed",
    header: "Fecha comprometida",
    render: (row) =>
      row.committedDeliveryDate ? (
        <span style={{ fontSize: 13, color: "#0c2c44" }}>
          {dateFormatter.format(new Date(row.committedDeliveryDate))}
        </span>
      ) : (
        <span style={{ fontSize: 13, color: "#6b7787" }}>—</span>
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
    key: "company",
    header: "Empresa",
    render: (row) =>
      row.companyPrefix ? (
        <span style={{ fontSize: 13, fontWeight: 600 }}>{row.companyPrefix}</span>
      ) : (
        <span style={{ fontSize: 13, color: "#6b7787" }}>—</span>
      ),
  },
  {
    key: "detail",
    header: "Detalle",
    align: "right",
    render: (row) => (
      <Link href={`/orders/${row.id}`} style={{ color: "#0f5c8a", textDecoration: "none", fontWeight: 700 }}>
        Abrir
      </Link>
    ),
  },
] as const;

function countByStatus(rows: OrderRow[], status: string) {
  return rows.filter((row) => row.status === status).length.toLocaleString("es-CO");
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const status = param(params, "status");
  const companyId = param(params, "companyId");
  const apiQuery = new URLSearchParams();
  if (status) apiQuery.set("status", status);
  if (companyId) apiQuery.set("companyId", companyId);
  const apiPath = apiQuery.toString() ? `/orders?${apiQuery.toString()}` : "/orders";
  const response = await apiFetch(apiPath);
  const orders: Order[] = response.ok ? await response.json() : [];

  const rows: OrderRow[] = orders.map((order) => ({
    id: order.id,
    status: order.status,
    subtotal: Number(order.subtotal),
    total: Number(order.total),
    customerName: order.customer?.displayName ?? null,
    customerId: order.customer?.id ?? null,
    companyName: order.company?.name ?? null,
    companyPrefix: order.company?.prefix ?? null,
    committedDeliveryDate: order.committedDeliveryDate ?? null,
    createdAt: order.createdAt,
  }));

  const user = await getCurrentUser();
  const userRole = user?.role ?? null;

  // El estado ya viene filtrado del API; la busqueda y la empresa recortan aqui.
  const filtered = applyFilters(rows, params, {
    search: (row) => [row.customerName],
    match: { companyName: (row) => row.companyName },
  });

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <PageHeader
        eyebrow="Ejecución comercial"
        title="Pedidos"
        description="Seguimiento operativo de pedidos activos, monetización y avance hacia facturación y entrega."
        actions={
          <>
            {canCreate(userRole, "order") && <ButtonLink href="/orders/new">Nuevo pedido</ButtonLink>}
            {canAccess(userRole, "/billing-requests") && (
              <ButtonLink href="/billing-requests" variant="secondary">
                Ver facturación
              </ButtonLink>
            )}
          </>
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 16,
        }}
      >
        <StatCard label="Recibidos" value={countByStatus(rows, "recibido")} tone="info" />
        <StatCard label="Orden facturación" value={countByStatus(rows, "orden_facturacion")} tone="warning" />
        <StatCard label="Facturados" value={countByStatus(rows, "facturado")} tone="neutral" />
        <StatCard label="Despachados" value={countByStatus(rows, "despachado")} tone="info" />
        <StatCard label="En tránsito" value={countByStatus(rows, "en_transito")} tone="warning" />
        <StatCard label="Entregados" value={countByStatus(rows, "entregado")} tone="success" />
      </div>

      <ListFilters
        searchPlaceholder="Buscar por cliente"
        selects={[
          {
            key: "status",
            allLabel: "Todos los estados",
            options: Object.entries(statusLabels).map(([value, label]) => ({ value, label })),
          },
          {
            key: "companyName",
            allLabel: "Todas las empresas",
            options: optionsFrom(rows, (row) => row.companyName),
          },
        ]}
        shown={filtered.length}
        noun="pedidos"
      />

      <SectionCard
        title="Cola de pedidos"
        description="Visualiza estado comercial, monto y contexto de cliente sin salir de la operación."
      >
        <DataTable
          columns={columns}
          rows={filtered}
          getRowKey={(row) => row.id}
          emptyState={
            <EmptyState
              title="No hay pedidos registrados"
              description="Genera el primer pedido para activar el flujo de ejecución comercial."
              action={canCreate(userRole, "order") && <ButtonLink href="/orders/new">Crear pedido</ButtonLink>}
            />
          }
        />
      </SectionCard>
    </div>
  );
}
