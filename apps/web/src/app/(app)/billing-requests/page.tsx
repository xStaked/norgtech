import Link from "next/link";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import type { CrmStatusTone } from "@/components/ui/theme";
import { apiFetch } from "@/lib/api.server";
import { getCurrentUser } from "@/lib/auth.server";
import { BillingRequestStatusAction } from "@/components/billing-requests/billing-request-status-action";
import { CreateBillingRequestModal } from "@/components/billing-requests/create-billing-request-modal";

interface Customer {
  id: string;
  displayName: string;
}

interface Opportunity {
  id: string;
  title: string;
}

interface Quote {
  id: string;
}

interface Order {
  id: string;
}

interface BillingRequest {
  id: string;
  sourceType: string;
  status: string;
  notes: string | null;
  createdAt: string;
  customer: Customer | null;
  opportunity: Opportunity | null;
  sourceQuote: Quote | null;
  sourceOrder: Order | null;
}

interface BillingRequestRow {
  id: string;
  sourceType: string;
  status: string;
  notes: string | null;
  createdAt: string;
  customerId: string | null;
  customerName: string | null;
  opportunityId: string | null;
  opportunityTitle: string | null;
  quoteId: string | null;
  orderId: string | null;
}

const statusLabels: Record<string, string> = {
  pendiente: "Pendiente",
  procesada: "Procesada",
  rechazada: "Rechazada",
};

const statusTones: Record<string, CrmStatusTone> = {
  pendiente: "warning",
  procesada: "success",
  rechazada: "danger",
};

const sourceTypeLabels: Record<string, string> = {
  quote: "Cotización",
  order: "Pedido",
  direct: "Directa",
};

const dateTimeFormatter = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function BillingRequestsPage() {
  const [response, customersResponse, user] = await Promise.all([
    apiFetch("/billing-requests"),
    apiFetch("/customers"),
    getCurrentUser(),
  ]);

  const billingRequests: BillingRequest[] = response.ok ? await response.json() : [];
  const customers: Array<{ id: string; displayName: string }> = customersResponse.ok
    ? await customersResponse.json()
    : [];

  const role = user?.role ?? null;
  const canAct = role === "administrador" || role === "director_comercial" || role === "facturacion";

  const rows: BillingRequestRow[] = billingRequests.map((billingRequest) => ({
    id: billingRequest.id,
    sourceType: billingRequest.sourceType,
    status: billingRequest.status,
    notes: billingRequest.notes,
    createdAt: billingRequest.createdAt,
    customerId: billingRequest.customer?.id ?? null,
    customerName: billingRequest.customer?.displayName ?? null,
    opportunityId: billingRequest.opportunity?.id ?? null,
    opportunityTitle: billingRequest.opportunity?.title ?? null,
    quoteId: billingRequest.sourceQuote?.id ?? null,
    orderId: billingRequest.sourceOrder?.id ?? null,
  }));

  const columns: readonly DataTableColumn<BillingRequestRow>[] = [
    {
      key: "request",
      header: "Solicitud",
      render: (row) => (
        <div style={{ display: "grid", gap: 4 }}>
          <strong>Solicitud #{row.id.slice(-6)}</strong>
          <span style={{ fontSize: 13, color: "#52637a" }}>{row.notes || "Sin notas registradas"}</span>
        </div>
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
      key: "origin",
      header: "Origen",
      render: (row) => {
        if (row.quoteId) {
          return (
            <Link href={`/quotes/${row.quoteId}`} style={{ color: "#2d6cdf", textDecoration: "none", fontWeight: 600 }}>
              {sourceTypeLabels[row.sourceType] ?? row.sourceType} #{row.quoteId.slice(-6)}
            </Link>
          );
        }
        if (row.orderId) {
          return (
            <Link href={`/orders/${row.orderId}`} style={{ color: "#2d6cdf", textDecoration: "none", fontWeight: 600 }}>
              {sourceTypeLabels[row.sourceType] ?? row.sourceType} #{row.orderId.slice(-6)}
            </Link>
          );
        }
        return <span style={{ color: "#6b7c93" }}>{sourceTypeLabels[row.sourceType] ?? row.sourceType}</span>;
      },
    },
    {
      key: "opportunity",
      header: "Oportunidad",
      render: (row) =>
        row.opportunityId ? (
          <Link href={`/opportunities/${row.opportunityId}`} style={{ color: "#2d6cdf", textDecoration: "none", fontWeight: 600 }}>
            {row.opportunityTitle}
          </Link>
        ) : (
          <span style={{ color: "#6b7c93" }}>Sin oportunidad</span>
        ),
    },
    {
      key: "status",
      header: "Estado",
      render: (row) => <BillingRequestStatusAction id={row.id} currentStatus={row.status} canChange={canAct} />,
    },
    {
      key: "created",
      header: "Creación",
      render: (row) => dateTimeFormatter.format(new Date(row.createdAt)),
    },
  ] as const;

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <PageHeader
        eyebrow="Facturación"
        title="Solicitudes de facturación"
        description="Solicitudes generadas desde cotizaciones y pedidos para seguimiento operativo."
        actions={canAct ? <CreateBillingRequestModal customers={customers} /> : undefined}
      />

      <FilterBar summary={`${rows.length.toLocaleString("es-CO")} solicitudes registradas`} />

      <SectionCard
        title="Cola de facturación"
        description="Controla origen, cliente, oportunidad asociada y estado actual de cada solicitud."
      >
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.id}
          emptyState={
            <EmptyState
              title="No hay solicitudes de facturación"
              description="Las solicitudes aparecerán aquí cuando se generen desde una cotización o un pedido."
            />
          }
        />
      </SectionCard>
    </div>
  );
}
