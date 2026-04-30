"use client";

import { useState } from "react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { crmTheme, type CrmStatusTone } from "@/components/ui/theme";

interface Opportunity {
  id: string;
  title: string;
  stage: string;
  estimatedValue: string | number | null;
  expectedCloseDate: string | null;
  createdAt: string;
}

interface Visit {
  id: string;
  scheduledAt: string;
  status: string;
  summary: string | null;
}

interface FollowUpTask {
  id: string;
  title: string;
  type: string;
  status: string;
  dueAt: string;
}

interface QuoteItem {
  id: string;
  productSnapshotName: string;
  quantity: string | number;
  unitPrice: string | number;
  subtotal: string | number;
}

interface Quote {
  id: string;
  status: string;
  total: string | number;
  createdAt: string;
  items: QuoteItem[];
}

interface OrderItem {
  id: string;
  productSnapshotName: string;
  quantity: string | number;
  unitPrice: string | number;
  subtotal: string | number;
}

interface Order {
  id: string;
  status: string;
  total: string | number;
  createdAt: string;
  items: OrderItem[];
}

interface BillingRequest {
  id: string;
  status: string;
  sourceType: string;
  createdAt: string;
}

interface CustomerHistory {
  opportunities: Opportunity[];
  visits: Visit[];
  followUpTasks: FollowUpTask[];
  quotes: Quote[];
  orders: Order[];
  billingRequests: BillingRequest[];
}

type TabKey =
  | "opportunities"
  | "visits"
  | "followUpTasks"
  | "quotes"
  | "orders"
  | "billingRequests";

const tabLabels: Record<TabKey, string> = {
  opportunities: "Oportunidades",
  visits: "Visitas",
  followUpTasks: "Seguimientos",
  quotes: "Cotizaciones",
  orders: "Pedidos",
  billingRequests: "Facturaciones",
};

function formatCurrency(value: string | number | null) {
  if (value == null) return "—";
  const num = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(num);
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("es-CO", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function mapStageTone(stage: string): CrmStatusTone {
  switch (stage) {
    case "venta_cerrada":
      return "success";
    case "perdida":
      return "danger";
    case "negociacion":
    case "orden_facturacion":
      return "warning";
    case "cotizacion":
      return "info";
    default:
      return "neutral";
  }
}

function mapVisitTone(status: string): CrmStatusTone {
  switch (status) {
    case "completada":
      return "success";
    case "cancelada":
    case "no_realizada":
      return "danger";
    default:
      return "neutral";
  }
}

function mapTaskTone(status: string): CrmStatusTone {
  switch (status) {
    case "completada":
      return "success";
    case "vencida":
      return "danger";
    default:
      return "warning";
  }
}

function mapQuoteTone(status: string): CrmStatusTone {
  switch (status) {
    case "cerrada":
      return "success";
    case "perdida":
      return "danger";
    case "en_negociacion":
      return "warning";
    default:
      return "info";
  }
}

function mapOrderTone(status: string): CrmStatusTone {
  switch (status) {
    case "entregado":
      return "success";
    case "despachado":
      return "info";
    case "facturado":
      return "info";
    case "orden_facturacion":
      return "warning";
    default:
      return "neutral";
  }
}

function mapBillingTone(status: string): CrmStatusTone {
  switch (status) {
    case "procesada":
      return "success";
    case "rechazada":
      return "danger";
    default:
      return "warning";
  }
}

const opportunityColumns: readonly DataTableColumn<Opportunity>[] = [
  { key: "title", header: "Nombre", render: (row) => row.title },
  {
    key: "stage",
    header: "Etapa",
    render: (row) => <StatusBadge tone={mapStageTone(row.stage)}>{row.stage}</StatusBadge>,
  },
  {
    key: "estimatedValue",
    header: "Valor estimado",
    align: "right",
    render: (row) => formatCurrency(row.estimatedValue),
  },
  {
    key: "expectedCloseDate",
    header: "Cierre esperado",
    align: "right",
    render: (row) => formatDate(row.expectedCloseDate),
  },
] as const;

const visitColumns: readonly DataTableColumn<Visit>[] = [
  {
    key: "scheduledAt",
    header: "Fecha programada",
    render: (row) => formatDate(row.scheduledAt),
  },
  {
    key: "status",
    header: "Estado",
    render: (row) => <StatusBadge tone={mapVisitTone(row.status)}>{row.status}</StatusBadge>,
  },
  { key: "summary", header: "Resumen", render: (row) => row.summary ?? "—" },
] as const;

const followUpTaskColumns: readonly DataTableColumn<FollowUpTask>[] = [
  { key: "title", header: "Titulo", render: (row) => row.title },
  {
    key: "type",
    header: "Tipo",
    render: (row) => row.type,
  },
  {
    key: "status",
    header: "Estado",
    render: (row) => <StatusBadge tone={mapTaskTone(row.status)}>{row.status}</StatusBadge>,
  },
  {
    key: "dueAt",
    header: "Vencimiento",
    align: "right",
    render: (row) => formatDate(row.dueAt),
  },
] as const;

const quoteColumns: readonly DataTableColumn<Quote>[] = [
  {
    key: "code",
    header: "Codigo",
    render: (row) => <span style={{ fontFamily: crmTheme.typography.mono, fontSize: 13 }}>{row.id.slice(0, 8)}</span>,
  },
  {
    key: "status",
    header: "Estado",
    render: (row) => <StatusBadge tone={mapQuoteTone(row.status)}>{row.status}</StatusBadge>,
  },
  {
    key: "total",
    header: "Total",
    align: "right",
    render: (row) => formatCurrency(row.total),
  },
  {
    key: "createdAt",
    header: "Fecha",
    align: "right",
    render: (row) => formatDate(row.createdAt),
  },
] as const;

const orderColumns: readonly DataTableColumn<Order>[] = [
  {
    key: "code",
    header: "Codigo",
    render: (row) => <span style={{ fontFamily: crmTheme.typography.mono, fontSize: 13 }}>{row.id.slice(0, 8)}</span>,
  },
  {
    key: "status",
    header: "Estado",
    render: (row) => <StatusBadge tone={mapOrderTone(row.status)}>{row.status}</StatusBadge>,
  },
  {
    key: "total",
    header: "Total",
    align: "right",
    render: (row) => formatCurrency(row.total),
  },
  {
    key: "createdAt",
    header: "Fecha",
    align: "right",
    render: (row) => formatDate(row.createdAt),
  },
] as const;

const billingRequestColumns: readonly DataTableColumn<BillingRequest>[] = [
  {
    key: "code",
    header: "Codigo",
    render: (row) => <span style={{ fontFamily: crmTheme.typography.mono, fontSize: 13 }}>{row.id.slice(0, 8)}</span>,
  },
  {
    key: "status",
    header: "Estado",
    render: (row) => <StatusBadge tone={mapBillingTone(row.status)}>{row.status}</StatusBadge>,
  },
  {
    key: "sourceType",
    header: "Origen",
    render: (row) => row.sourceType,
  },
  {
    key: "createdAt",
    header: "Fecha",
    align: "right",
    render: (row) => formatDate(row.createdAt),
  },
] as const;

export function CustomerHistorySection({ history }: { history: CustomerHistory }) {
  const [activeTab, setActiveTab] = useState<TabKey>("opportunities");

  const tabs: { key: TabKey; count: number }[] = [
    { key: "opportunities", count: history.opportunities.length },
    { key: "visits", count: history.visits.length },
    { key: "followUpTasks", count: history.followUpTasks.length },
    { key: "quotes", count: history.quotes.length },
    { key: "orders", count: history.orders.length },
    { key: "billingRequests", count: history.billingRequests.length },
  ];

  const emptyMessages: Record<TabKey, { title: string; description: string }> = {
    opportunities: {
      title: "Sin oportunidades",
      description: "Este cliente aun no tiene oportunidades registradas.",
    },
    visits: {
      title: "Sin visitas",
      description: "Este cliente aun no tiene visitas registradas.",
    },
    followUpTasks: {
      title: "Sin seguimientos",
      description: "Este cliente aun no tiene tareas de seguimiento.",
    },
    quotes: {
      title: "Sin cotizaciones",
      description: "Este cliente aun no tiene cotizaciones registradas.",
    },
    orders: {
      title: "Sin pedidos",
      description: "Este cliente aun no tiene pedidos registrados.",
    },
    billingRequests: {
      title: "Sin facturaciones",
      description: "Este cliente aun no tiene solicitudes de facturacion.",
    },
  };

  function renderTable() {
    const empty = emptyMessages[activeTab];

    switch (activeTab) {
      case "opportunities":
        return (
          <DataTable
            columns={opportunityColumns}
            rows={history.opportunities}
            getRowKey={(row) => row.id}
            emptyState={<EmptyState title={empty.title} description={empty.description} />}
          />
        );
      case "visits":
        return (
          <DataTable
            columns={visitColumns}
            rows={history.visits}
            getRowKey={(row) => row.id}
            emptyState={<EmptyState title={empty.title} description={empty.description} />}
          />
        );
      case "followUpTasks":
        return (
          <DataTable
            columns={followUpTaskColumns}
            rows={history.followUpTasks}
            getRowKey={(row) => row.id}
            emptyState={<EmptyState title={empty.title} description={empty.description} />}
          />
        );
      case "quotes":
        return (
          <DataTable
            columns={quoteColumns}
            rows={history.quotes}
            getRowKey={(row) => row.id}
            emptyState={<EmptyState title={empty.title} description={empty.description} />}
          />
        );
      case "orders":
        return (
          <DataTable
            columns={orderColumns}
            rows={history.orders}
            getRowKey={(row) => row.id}
            emptyState={<EmptyState title={empty.title} description={empty.description} />}
          />
        );
      case "billingRequests":
        return (
          <DataTable
            columns={billingRequestColumns}
            rows={history.billingRequests}
            getRowKey={(row) => row.id}
            emptyState={<EmptyState title={empty.title} description={empty.description} />}
          />
        );
      default:
        return null;
    }
  }

  return (
    <SectionCard
      title="Historial 360"
      description="Toda la actividad comercial del cliente en un solo lugar."
    >
      <div
        role="tablist"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 4,
          marginBottom: 16,
          borderBottom: `1px solid ${crmTheme.colors.border}`,
          paddingBottom: 8,
        }}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: "8px 14px",
                borderRadius: crmTheme.radius.md,
                border: "none",
                background: isActive ? crmTheme.colors.primary : "transparent",
                color: isActive ? "#ffffff" : crmTheme.colors.textMuted,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {tabLabels[tab.key]}
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: 20,
                  height: 20,
                  padding: "0 6px",
                  borderRadius: 999,
                  background: isActive ? "rgba(255,255,255,0.2)" : crmTheme.colors.surfaceMuted,
                  color: isActive ? "#ffffff" : crmTheme.colors.textSubtle,
                  fontSize: 11,
                  fontWeight: 800,
                }}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {renderTable()}
    </SectionCard>
  );
}
