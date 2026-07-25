import Link from "next/link";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ListFilters } from "@/components/ui/list-filters";
import { applyFilters, type SearchParams } from "@/lib/list-filter";
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
  company: { id: string; name: string; prefix: string } | null;
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
  companyName: string | null;
  companyPrefix: string | null;
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

export default async function BillingRequestsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
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
    companyName: billingRequest.company?.name ?? null,
    companyPrefix: billingRequest.company?.prefix ?? null,
  }));

  const filtered = applyFilters(rows, params, {
    search: (row) => [row.customerName, row.opportunityTitle, row.notes, row.companyName],
    match: {
      status: (row) => row.status,
      sourceType: (row) => row.sourceType,
    },
  });

  const columns: readonly DataTableColumn<BillingRequestRow>[] = [
    {
      key: "request",
      header: "Solicitud",
      render: (row) => (
        <div style={{ display: "grid", gap: 4 }}>
          <strong>Solicitud #{row.id.slice(-6)}</strong>
          <span style={{ fontSize: 13, color: "#44556e" }}>{row.notes || "Sin notas registradas"}</span>
        </div>
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
      key: "origin",
      header: "Origen",
      render: (row) => {
        if (row.quoteId) {
          return (
            <Link href={`/quotes/${row.quoteId}`} style={{ color: "#0f5c8a", textDecoration: "none", fontWeight: 600 }}>
              {sourceTypeLabels[row.sourceType] ?? row.sourceType} #{row.quoteId.slice(-6)}
            </Link>
          );
        }
        if (row.orderId) {
          return (
            <Link href={`/orders/${row.orderId}`} style={{ color: "#0f5c8a", textDecoration: "none", fontWeight: 600 }}>
              {sourceTypeLabels[row.sourceType] ?? row.sourceType} #{row.orderId.slice(-6)}
            </Link>
          );
        }
        return <span style={{ color: "#6b7787" }}>{sourceTypeLabels[row.sourceType] ?? row.sourceType}</span>;
      },
    },
    {
      key: "opportunity",
      header: "Oportunidad",
      render: (row) =>
        row.opportunityId ? (
          <Link href={`/opportunities/${row.opportunityId}`} style={{ color: "#0f5c8a", textDecoration: "none", fontWeight: 600 }}>
            {row.opportunityTitle}
          </Link>
        ) : (
          <span style={{ color: "#6b7787" }}>Sin oportunidad</span>
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

      <ListFilters
        searchPlaceholder="Buscar por cliente, oportunidad o nota"
        selects={[
          {
            key: "status",
            allLabel: "Todos los estados",
            options: Object.entries(statusLabels).map(([value, label]) => ({ value, label })),
          },
          {
            key: "sourceType",
            allLabel: "Todos los orígenes",
            options: Object.entries(sourceTypeLabels).map(([value, label]) => ({ value, label })),
          },
        ]}
        shown={filtered.length}
        total={rows.length}
        noun="solicitudes"
      />

      <SectionCard
        title="Cola de facturación"
        description="Controla origen, cliente, oportunidad asociada y estado actual de cada solicitud."
      >
        <DataTable
          columns={columns}
          rows={filtered}
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
