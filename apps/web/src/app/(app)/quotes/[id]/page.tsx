import { notFound } from "next/navigation";
import { QuoteBillingButton } from "@/components/quotes/quote-billing-button";
import { ButtonLink } from "@/components/ui/button-link";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { DetailSection } from "@/components/ui/detail-section";
import { InlineMetric } from "@/components/ui/inline-metric";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
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
}

interface QuoteItem {
  id: string;
  productSnapshotName: string;
  productSnapshotSku: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  originalUnitPrice: string | null;
  discountPercent: string | null;
  subtotal: string;
  notes: string | null;
}

interface Quote {
  id: string;
  status: string;
  subtotal: string;
  total: string;
  notes: string | null;
  validUntil: string | null;
  customer: Customer | null;
  opportunity: Opportunity | null;
  items: QuoteItem[];
  createdAt: string;
}

const statusLabels: Record<string, string> = {
  abierta: "Abierta",
  en_negociacion: "En negociación",
  cerrada: "Cerrada",
  perdida: "Perdida",
};

const statusTones: Record<string, CrmStatusTone> = {
  abierta: "info",
  en_negociacion: "warning",
  cerrada: "success",
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

const quoteItemColumns: readonly DataTableColumn<QuoteItem>[] = [
  {
    key: "product",
    header: "Producto",
    render: (item) => (
      <div style={{ display: "grid", gap: 6 }}>
        <span style={{ fontWeight: 700 }}>{item.productSnapshotName}</span>
        {item.notes ? (
          <span style={{ fontSize: 13, color: "#44556e" }}>{item.notes}</span>
        ) : null}
      </div>
    ),
  },
  {
    key: "sku",
    header: "SKU",
    render: (item) => item.productSnapshotSku,
  },
  {
    key: "quantity",
    header: "Cantidad",
    align: "right",
    render: (item) => `${formatNumber(item.quantity)} ${item.unit}`,
  },
  {
    key: "unitPrice",
    header: "Precio unit.",
    align: "right",
    // Show the discount that produced this price, otherwise the saved unitPrice
    // looks arbitrary next to the catalog's base price (QUO-03).
    render: (item) => {
      const discount = Number(item.discountPercent ?? 0);
      if (!(discount > 0) || !item.originalUnitPrice) {
        return formatCurrency(item.unitPrice);
      }
      return (
        <span className="inline-flex items-center gap-1.5">
          <span className="text-muted-foreground line-through">
            {formatCurrency(item.originalUnitPrice)}
          </span>
          <span>{formatCurrency(item.unitPrice)}</span>
          <span className="text-xs text-emerald-600">-{discount.toFixed(2)}%</span>
        </span>
      );
    },
  },
  {
    key: "subtotal",
    header: "Subtotal",
    align: "right",
    render: (item) => <strong>{formatCurrency(item.subtotal)}</strong>,
  },
] as const;

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const response = await apiFetch(`/quotes/${id}`);

  if (!response.ok) {
    notFound();
  }

  const quote: Quote = await response.json();

  // Derived from the saved lines, so it always reconciles with the stored
  // subtotal — no recomputing of prices on the client (QUO-03).
  const discountAmount = quote.items.reduce((sum, item) => {
    if (!item.originalUnitPrice) return sum;
    const perUnit = Number(item.originalUnitPrice) - Number(item.unitPrice);
    return sum + perUnit * Number(item.quantity);
  }, 0);

  return (
    <div
      style={{
        display: "grid",
        gap: 24,
      }}
    >
      <PageHeader
        eyebrow="Detalle comercial"
        title={`Cotización #${quote.id.slice(-6)}`}
        description={
          quote.customer?.displayName
            ? `Propuesta asociada a ${quote.customer.displayName}.`
            : "Propuesta comercial registrada en el CRM."
        }
        actions={
          <>
            <ButtonLink href="/quotes" variant="ghost">
              Volver a cotizaciones
            </ButtonLink>
            <StatusBadge tone={statusTones[quote.status] ?? "neutral"}>
              {statusLabels[quote.status] ?? quote.status}
            </StatusBadge>
          </>
        }
      />

      <DetailSection
        title="Resumen de la cotización"
        description="Contexto comercial, vigencia y vínculo con la oportunidad asociada."
        fields={[
          { label: "Cliente", value: quote.customer?.displayName ?? "Sin cliente" },
          { label: "Oportunidad", value: quote.opportunity?.title ?? "Sin oportunidad" },
          {
            label: "Válida hasta",
            value: quote.validUntil ? formatDate(quote.validUntil) : "Sin fecha definida",
          },
          { label: "Creada", value: formatDate(quote.createdAt) },
        ]}
        aside={
          <div
            style={{
              display: "grid",
              gap: 12,
            }}
          >
            {discountAmount > 0 && (
              <>
                <InlineMetric
                  label="Subtotal sin descuento"
                  value={formatCurrency(String(Number(quote.subtotal) + discountAmount))}
                  tone="info"
                />
                <InlineMetric
                  label="Descuento por segmento"
                  value={`-${formatCurrency(String(discountAmount))}`}
                  tone="success"
                />
              </>
            )}
            <InlineMetric label="Subtotal" value={formatCurrency(quote.subtotal)} tone="info" />
            <InlineMetric label="Total" value={formatCurrency(quote.total)} tone="success" />
            <InlineMetric
              label="Ítems"
              value={quote.items.length.toLocaleString("es-CO")}
              tone="neutral"
            />
          </div>
        }
      />

      {quote.notes ? (
        <SectionCard title="Notas" description="Observaciones registradas para esta propuesta.">
          <p
            style={{
              margin: 0,
              lineHeight: 1.6,
              color: "#0c2c44",
            }}
          >
            {quote.notes}
          </p>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Items cotizados"
        description="Detalle de productos, cantidades y valor cotizado por línea."
      >
        <DataTable
          columns={quoteItemColumns}
          rows={quote.items}
          getRowKey={(item) => item.id}
          caption={`${quote.items.length.toLocaleString("es-CO")} item(s) incluidos en la cotización.`}
        />
      </SectionCard>

      <SectionCard
        padding="18px 20px"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "grid", gap: 4 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "#6b7787",
              textTransform: "uppercase",
            }}
          >
            Total cotizado
          </span>
          <strong style={{ fontSize: 28, lineHeight: 1, color: "#0c2c44" }}>
            {formatCurrency(quote.total)}
          </strong>
        </div>

        {quote.status === "cerrada" ? (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <QuoteBillingButton quoteId={quote.id} />
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}

function formatCurrency(value: string) {
  return currencyFormatter.format(Number(value));
}

function formatNumber(value: string) {
  return Number(value).toLocaleString("es-CO");
}

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}
