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

interface Order {
  id: string;
  status: string;
  subtotal: string;
  total: string;
  committedDeliveryDate: string | null;
  customer: Customer | null;
  createdAt: string;
}

interface OrderRow {
  id: string;
  status: string;
  subtotal: number;
  total: number;
  customerName: string | null;
  customerId: string | null;
  committedDeliveryDate: string | null;
  createdAt: string;
}

const statusLabels: Record<string, string> = {
  recibido: "Recibido",
  orden_facturacion: "Orden de facturación",
  facturado: "Facturado",
  despachado: "Despachado",
  entregado: "Entregado",
};

const statusTones: Record<string, CrmStatusTone> = {
  recibido: "info",
  orden_facturacion: "warning",
  facturado: "neutral",
  despachado: "info",
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
        <Link href={`/orders/${row.id}`} style={{ fontWeight: 700, color: "#10233f", textDecoration: "none" }}>
          Pedido #{row.id.slice(-6)}
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
        <Link href={`/customers/${row.customerId}`} style={{ color: "#2d6cdf", textDecoration: "none", fontWeight: 600 }}>
          {row.customerName}
        </Link>
      ) : (
        <span style={{ color: "#6b7c93" }}>Sin cliente</span>
      ),
  },
  {
    key: "committed",
    header: "Fecha comprometida",
    render: (row) =>
      row.committedDeliveryDate ? (
        <span style={{ fontSize: 13, color: "#10233f" }}>
          {dateFormatter.format(new Date(row.committedDeliveryDate))}
        </span>
      ) : (
        <span style={{ fontSize: 13, color: "#6b7c93" }}>—</span>
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
      <Link href={`/orders/${row.id}`} style={{ color: "#2d6cdf", textDecoration: "none", fontWeight: 700 }}>
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
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const apiPath = status ? `/orders?status=${encodeURIComponent(status)}` : "/orders";
  const response = await apiFetch(apiPath);
  const orders: Order[] = response.ok ? await response.json() : [];

  const rows: OrderRow[] = orders.map((order) => ({
    id: order.id,
    status: order.status,
    subtotal: Number(order.subtotal),
    total: Number(order.total),
    customerName: order.customer?.displayName ?? null,
    customerId: order.customer?.id ?? null,
    committedDeliveryDate: order.committedDeliveryDate ?? null,
    createdAt: order.createdAt,
  }));

  const filterSummary = status
    ? `${rows.length.toLocaleString("es-CO")} pedidos en estado "${statusLabels[status] ?? status}"`
    : `${rows.length.toLocaleString("es-CO")} pedidos registrados`;

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <PageHeader
        eyebrow="Ejecución comercial"
        title="Pedidos"
        description="Seguimiento operativo de pedidos activos, monetización y avance hacia facturación y entrega."
        actions={
          <>
            <ButtonLink href="/orders/new">Nuevo pedido</ButtonLink>
            <ButtonLink href="/billing-requests" variant="secondary">
              Ver facturación
            </ButtonLink>
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
        <StatCard label="Entregados" value={countByStatus(rows, "entregado")} tone="success" />
      </div>

      <FilterBar summary={filterSummary}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <FilterLink label="Todos" active={!status} href="/orders" />
          <FilterLink label="Recibido" active={status === "recibido"} href="/orders?status=recibido" />
          <FilterLink label="Orden facturación" active={status === "orden_facturacion"} href="/orders?status=orden_facturacion" />
          <FilterLink label="Facturado" active={status === "facturado"} href="/orders?status=facturado" />
          <FilterLink label="Despachado" active={status === "despachado"} href="/orders?status=despachado" />
          <FilterLink label="Entregado" active={status === "entregado"} href="/orders?status=entregado" />
        </div>
      </FilterBar>

      <SectionCard
        title="Cola de pedidos"
        description="Visualiza estado comercial, monto y contexto de cliente sin salir de la operación."
      >
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.id}
          emptyState={
            <EmptyState
              title="No hay pedidos registrados"
              description="Genera el primer pedido para activar el flujo de ejecución comercial."
              action={<ButtonLink href="/orders/new">Crear pedido</ButtonLink>}
            />
          }
        />
      </SectionCard>
    </div>
  );
}

function FilterLink({ label, active, href }: { label: string; active: boolean; href: string }) {
  return (
    <Link
      href={href}
      style={{
        padding: "6px 12px",
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 600,
        textDecoration: "none",
        backgroundColor: active ? "#10233f" : "#eef3f8",
        color: active ? "#ffffff" : "#52637a",
        border: `1px solid ${active ? "#10233f" : "#dbe4ef"}`,
      }}
    >
      {label}
    </Link>
  );
}
