import Link from "next/link";
import { ButtonLink } from "@/components/ui/button-link";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ListFilters } from "@/components/ui/list-filters";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import type { CrmStatusTone } from "@/components/ui/theme";
import { apiFetch } from "@/lib/api.server";
import { getCurrentUser } from "@/lib/auth.server";
import { applyFilters, optionsFrom, type SearchParams } from "@/lib/list-filter";
import {
  PRICE_LIST_KIND_LABEL,
  priceListContext,
  priceListOwner,
  type PriceListRef,
} from "@/lib/catalog";

interface PriceListApiItem extends PriceListRef {
  active: boolean;
  _count: { items: number; customers: number };
}

interface PriceListRow {
  id: string;
  name: string;
  kind: PriceListRef["kind"];
  context: string;
  items: number;
  customers: number;
  customerName: string | null;
  customerId: string | null;
  active: boolean;
}

const kindTones: Record<PriceListRef["kind"], CrmStatusTone> = {
  segmento: "info",
  export: "warning",
  linea: "neutral",
  cliente: "success",
};

const columns: readonly DataTableColumn<PriceListRow>[] = [
  {
    key: "name",
    header: "Lista",
    render: (row) => (
      <div style={{ display: "grid", gap: 4 }}>
        <Link
          href={`/price-lists/${row.id}`}
          style={{ color: "#0f5c8a", textDecoration: "none", fontWeight: 700 }}
        >
          {row.name}
        </Link>
        <span style={{ fontSize: 12.5, color: "#44556e" }}>{row.context}</span>
      </div>
    ),
  },
  {
    key: "kind",
    header: "Tipo",
    render: (row) => (
      <StatusBadge tone={kindTones[row.kind]}>
        {PRICE_LIST_KIND_LABEL[row.kind] ?? row.kind}
      </StatusBadge>
    ),
  },
  {
    key: "customer",
    header: "Cliente",
    render: (row) =>
      row.customerId ? (
        <Link
          href={`/customers/${row.customerId}`}
          style={{ color: "#0f5c8a", textDecoration: "none", fontWeight: 600 }}
        >
          {row.customerName}
        </Link>
      ) : (
        <span style={{ fontSize: 13, color: "#6b7787" }}>
          {row.kind === "cliente" ? "Sin cliente asignado" : "—"}
        </span>
      ),
  },
  {
    key: "items",
    header: "Ítems",
    align: "right",
    render: (row) => row.items.toLocaleString("es-CO"),
  },
] as const;

export default async function PriceListsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const [response, user, specialRes] = await Promise.all([
    apiFetch("/price-lists"),
    getCurrentUser(),
    apiFetch("/special-price-lists"),
  ]);
  const lists = (response.ok ? await response.json() : []) as PriceListApiItem[];
  const specialLists = (specialRes.ok ? await specialRes.json().catch(() => []) : []) as Array<{
    id: string;
    name: string;
    ownerUserId: string;
    active: boolean;
    revisions: Array<{ id: string; status: string; active: boolean }>;
  }>;
  const role = user?.role ?? null;
  const canManage = role === "administrador" || role === "director_comercial" || role === "promotor";
  const canSpecial = canManage || role === "comercial";

  const rows: PriceListRow[] = lists.map((list) => ({
    id: list.id,
    name: priceListOwner(list),
    kind: list.kind,
    context: priceListContext(list),
    items: list._count.items,
    customers: list._count.customers,
    customerName: list.customers?.[0]?.displayName ?? null,
    customerId: list.customers?.[0]?.id ?? null,
    active: list.active,
  }));

  const filtered = applyFilters(rows, params, {
    search: (row) => [row.name, row.customerName, row.context],
    match: { kind: (row) => row.kind },
  });

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <PageHeader
        eyebrow="Catálogo"
        title={`Listas de precios · ${rows.length}`}
        description="Administra listas generales y revisa listas especiales con precios por cliente."
        actions={
          <>
            {canManage ? (
              <ButtonLink href="/price-lists/new" variant="primary">
                Nueva lista
              </ButtonLink>
            ) : null}
            {canSpecial ? (
              <ButtonLink href="/price-lists/special/new" variant="secondary">
                Subir lista especial
              </ButtonLink>
            ) : null}
          </>
        }
      />

      <ListFilters
        searchPlaceholder="Buscar por lista, cliente o moneda"
        selects={[
          {
            key: "kind",
            allLabel: "Todos los tipos",
            options: optionsFrom(rows, (row) => row.kind),
          },
        ]}
        shown={filtered.length}
        total={rows.length}
        noun="listas"
      />

      <SectionCard
        title="Listas"
        description="Cada lista muestra a quién pertenece, en qué moneda/país cotiza y cuántos ítems tiene."
      >
        <DataTable
          columns={columns}
          rows={filtered}
          getRowKey={(row) => row.id}
          emptyState={
            <EmptyState
              title="No hay listas de precios"
              description="Crea la primera lista general desde Nueva lista."
            />
          }
        />
      </SectionCard>

      {canSpecial ? (
        <SectionCard
          title="Listas especiales"
          description="Precios negociados por cliente y presentación. Solo aplican al comercial propietario cuando están aprobadas."
        >
          {specialLists.length === 0 ? (
            <EmptyState
              title="Sin listas especiales"
              description="Sube tu primera lista especial para revisión."
            />
          ) : (
            <ul style={{ display: "grid", gap: 8, margin: 0, padding: 0, listStyle: "none" }}>
              {specialLists.map((list) => (
                <li key={list.id}>
                  <Link
                    href={`/price-lists/special/${list.id}`}
                    style={{ color: "#0f5c8a", fontWeight: 700, textDecoration: "none" }}
                  >
                    {list.name}
                  </Link>{" "}
                  <StatusBadge tone={list.active ? "success" : "neutral"}>
                    {list.active ? "Activa" : "Inactiva"}
                  </StatusBadge>{" "}
                  <span style={{ fontSize: 12, color: "#6b7787" }}>
                    {list.revisions?.[0]?.status ?? ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      ) : null}
    </div>
  );
}
