import Link from "next/link";
import { notFound } from "next/navigation";
import { ButtonLink } from "@/components/ui/button-link";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { DetailSection } from "@/components/ui/detail-section";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import type { CrmStatusTone } from "@/components/ui/theme";
import { apiFetch } from "@/lib/api.server";
import {
  PRICE_LIST_KIND_LABEL,
  formatPrice,
  formatTax,
  priceListContext,
  priceListOwner,
  type PriceListRef,
} from "@/lib/catalog";
import { summarizeHistory, type PriceHistoryEntry } from "@/lib/price-history";

interface PriceListItem {
  id: string;
  priceSinIva: string | null;
  priceConIva: string | null;
  taxPercent: string | null;
  priceSinIva2: string | null;
  priceConIva2: string | null;
  priceSinIva3: string | null;
  priceConIva3: string | null;
  empaque: string;
  form: string | null;
  dosage: string | null;
  product: { id: string; sku: string; name: string; unit: string };
}

interface PriceListDetail {
  id: string;
  name: string;
  kind: PriceListRef["kind"];
  currency: string;
  country: string | null;
  active: boolean;
  items: PriceListItem[];
  customers: Array<{ id: string; displayName: string; taxId: string | null; country: string | null }>;
}

interface PriceRow {
  id: string;
  productName: string;
  productSku: string;
  presentation: string;
  sinIva: string | null;
  conIva: string | null;
  tax: string | null;
  currency: string;
  extraLevels: number;
}

const kindTones: Record<PriceListRef["kind"], CrmStatusTone> = {
  segmento: "info",
  export: "warning",
  linea: "neutral",
  cliente: "success",
};

export default async function PriceListDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const response = await apiFetch(`/price-lists/${id}`);

  if (!response.ok) {
    notFound();
  }

  // El historial vive en AuditLog (`price_list.item_upserted`). Solo
  // admin/dirección lo pueden leer: para el resto la página sigue igual.
  const historyRes = await apiFetch(`/audit?entityType=PriceList&entityId=${encodeURIComponent(id)}`);
  const history = (
    historyRes.ok ? await historyRes.json().catch(() => []) : []
  ) as PriceHistoryEntry[];
  const timeline = summarizeHistory(history);

  const list = (await response.json()) as PriceListDetail;
  const listRef: PriceListRef = {
    id: list.id,
    name: list.name,
    kind: list.kind,
    currency: list.currency,
    country: list.country,
    customers: list.customers.map((c) => ({
      id: c.id,
      displayName: c.displayName,
      currency: list.currency,
      country: c.country,
    })),
  };
  const title = priceListOwner(listRef);

  const rows: PriceRow[] = list.items.map((item) => ({
    id: item.id,
    productName: item.product.name,
    productSku: item.product.sku,
    presentation: [item.empaque, item.form, item.dosage].filter(Boolean).join(" · "),
    sinIva: item.priceSinIva,
    conIva: item.priceConIva,
    tax: item.taxPercent,
    currency: list.currency,
    extraLevels:
      (item.priceSinIva2 !== null || item.priceConIva2 !== null ? 1 : 0) +
      (item.priceSinIva3 !== null || item.priceConIva3 !== null ? 1 : 0),
  }));

  const columns: readonly DataTableColumn<PriceRow>[] = [
    {
      key: "product",
      header: "Producto",
      render: (row) => (
        <div style={{ display: "grid", gap: 2 }}>
          <span style={{ fontWeight: 700, color: "#0c2c44" }}>{row.productName}</span>
          <span style={{ fontSize: 12, color: "#6b7787", fontFamily: "monospace" }}>
            {row.productSku} · {row.presentation}
          </span>
        </div>
      ),
    },
    {
      key: "sinIva",
      header: "Sin IVA",
      align: "right",
      render: (row) => formatPrice(row.sinIva, row.currency) || "—",
    },
    {
      key: "conIva",
      header: "Con IVA",
      align: "right",
      render: (row) => formatPrice(row.conIva, row.currency) || "—",
    },
    {
      key: "tax",
      header: "IVA",
      align: "right",
      render: (row) => (
        <span>
          {formatTax(row.tax)}
          {row.extraLevels > 0 ? (
            <span style={{ marginLeft: 6, fontSize: 11, color: "#6b7787" }}>+{row.extraLevels}</span>
          ) : null}
        </span>
      ),
    },
  ] as const;

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <PageHeader
        eyebrow="Catálogo · Lista de precios"
        title={title}
        description={`${PRICE_LIST_KIND_LABEL[list.kind] ?? list.kind} · ${priceListContext(listRef)} · ${rows.length.toLocaleString("es-CO")} ítems. Solo lectura.`}
        actions={
          <ButtonLink href="/price-lists" variant="secondary">
            Volver a listas
          </ButtonLink>
        }
      />

      <DetailSection
        title="Lista"
        fields={[
          { label: "Tipo", value: PRICE_LIST_KIND_LABEL[list.kind] ?? list.kind },
          { label: "Moneda", value: list.currency },
          { label: "País", value: list.country ?? "—" },
          {
            label: "Cliente",
            value:
              list.customers.length > 0 ? (
                <Link
                  href={`/customers/${list.customers[0].id}`}
                  style={{ color: "#0f5c8a", fontWeight: 700, textDecoration: "none" }}
                >
                  {list.customers[0].displayName}
                </Link>
              ) : list.kind === "cliente" ? (
                "Sin cliente asignado"
              ) : (
                "—"
              ),
          },
          {
            label: "Estado",
            value: <StatusBadge tone={list.active ? "success" : "neutral"}>{list.active ? "Activa" : "Inactiva"}</StatusBadge>,
          },
        ]}
      />

      <SectionCard
        title="Precios por presentación"
        description="Precios tal cual la importación oficial. Para corregir un precio, edita el producto."
      >
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.id}
          emptyState={
            <EmptyState
              title="Lista sin ítems"
              description="Esta lista aún no tiene presentaciones con precio."
            />
          }
        />
      </SectionCard>

      <p style={{ fontSize: 12, color: "#6b7787", margin: 0 }}>
        <StatusBadge tone={kindTones[list.kind]}>{PRICE_LIST_KIND_LABEL[list.kind] ?? list.kind}</StatusBadge>{" "}
        Los niveles 2/3 (cuando existen) se gestionan desde Productos.
      </p>

      {timeline.length > 0 ? (
        <SectionCard
          title="Historial de cambios"
          description="Quién y cuándo cambió cada precio, con antes y después por presentación. Solo lectura."
        >
          <ul style={{ display: "grid", gap: 12, margin: 0, padding: 0, listStyle: "none" }}>
            {timeline.map((entry) => {
              const empaque =
                entry.nextState?.empaque ?? entry.previousState?.empaque ?? "Presentación";
              const when = new Date(entry.createdAt);
              return (
                <li
                  key={entry.id}
                  style={{
                    display: "grid",
                    gap: 2,
                    borderLeft: "3px solid #c7d3df",
                    paddingLeft: 12,
                  }}
                >
                  <span style={{ fontWeight: 700, color: "#0c2c44", fontSize: 13 }}>
                    {empaque} · {entry.change}
                  </span>
                  <span style={{ fontSize: 12, color: "#6b7787" }}>
                    {Number.isNaN(+when)
                      ? entry.createdAt
                      : when.toLocaleString("es-CO", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                    · {(entry.actorUserId ?? "—").slice(0, 8)}
                  </span>
                </li>
              );
            })}
          </ul>
        </SectionCard>
      ) : null}
    </div>
  );
}
