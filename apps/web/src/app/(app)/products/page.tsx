import Link from "next/link";
import { apiFetch } from "@/lib/api.server";
import { formatPrice } from "@/lib/catalog";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button-link";
import { ListFilters } from "@/components/ui/list-filters";
import { StatusBadge } from "@/components/ui/status-badge";
import { applyFilters, optionsFrom, type SearchParams } from "@/lib/list-filter";

interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  active: boolean;
  presentationCount: number;
  priceListCount: number;
  /** Mínimo y máximo por moneda. COP y USD nunca se mezclan. */
  priceRange: Record<string, { min: number; max: number }>;
}

const AVATAR_COLORS = [
  "#0f5c8a",
  "#167c4a",
  "#6d4ff0",
  "#b8690f",
  "#b42318",
  "#0288c4",
  "#7a5cff",
  "#0a7d6b",
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const response = await apiFetch("/products?includeInactive=true");
  const all: Product[] = response.ok ? await response.json() : [];

  const products = applyFilters(all, params, {
    search: (product) => [product.name, product.sku, product.description],
    match: {
      unit: (product) => product.unit,
      active: (product) => String(product.active),
      priced: (product) => (Object.keys(product.priceRange).length > 0 ? "si" : "no"),
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="CATÁLOGO"
        title={`Productos · ${all.length}`}
        actions={
          <>
            <ButtonLink href="/products" variant="secondary">
              Exportar
            </ButtonLink>
            <ButtonLink href="/products/new">Nuevo producto</ButtonLink>
          </>
        }
      />

      <ListFilters
        searchPlaceholder="Buscar producto, SKU o descripción"
        selects={[
          { key: "unit", allLabel: "Todas las unidades", options: optionsFrom(all, (p) => p.unit) },
          {
            key: "active",
            allLabel: "Todos los estados",
            options: [
              { value: "true", label: "Activos" },
              { value: "false", label: "Inactivos" },
            ],
          },
          {
            key: "priced",
            allLabel: "Con y sin precio",
            options: [
              { value: "si", label: "Con precio" },
              { value: "no", label: "Sin precio" },
            ],
          },
        ]}
        shown={products.length}
        total={all.length}
        noun="productos"
      />

      {products.length === 0 ? (
        <p className="text-muted-foreground">
          {all.length === 0 ? "No hay productos registrados." : "Ningún producto coincide con los filtros."}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <Link
              key={product.id}
              href={`/products/${product.id}`}
              className="group block rounded-[11px] border border-border bg-card p-4 transition-all hover:border-[#c7d3df] hover:shadow-[0_6px_18px_rgba(12,44,68,.08)]"
            >
              <div className="flex items-start gap-2.5">
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[9px] text-[13px] font-bold text-white"
                  style={{ backgroundColor: avatarColor(product.name) }}
                >
                  {initials(product.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-bold text-foreground">
                    {product.name}
                  </div>
                  {!product.active ? (
                    <div className="mt-1">
                      <StatusBadge tone="neutral">Inactivo</StatusBadge>
                    </div>
                  ) : null}
                </div>
                <div className="shrink-0 text-right">
                  {/* Rango, no un precio único: el mismo producto vale distinto
                      en cada lista. Una moneda por línea, nunca convertidas. */}
                  {Object.entries(product.priceRange).length === 0 ? (
                    <div className="text-[12px] text-muted-foreground">Sin precio</div>
                  ) : (
                    Object.entries(product.priceRange).map(([currency, range]) => (
                      <div key={currency}>
                        <div className="font-mono text-[12.5px] font-bold tabular-nums text-[#167c4a]">
                          {range.min === range.max
                            ? formatPrice(range.min, currency)
                            : `${formatPrice(range.min, currency)} – ${formatPrice(range.max, currency)}`}
                        </div>
                        <div className="text-[10.5px] text-muted-foreground">
                          {currency} · sin IVA
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="my-[10px] mt-3 flex flex-wrap gap-1.5">
                <span className="rounded-md bg-[#e6f0f6] px-2 py-0.5 text-[11px] font-semibold text-[#0f5c8a]">
                  {product.sku}
                </span>
                <span className="rounded-md bg-[#eef1f6] px-2 py-0.5 text-[11px] font-semibold text-[#44556e]">
                  {product.unit}
                </span>
                <span className="rounded-md bg-[#eef1f6] px-2 py-0.5 text-[11px] font-semibold text-[#44556e]">
                  {product.presentationCount} presentaciones
                </span>
                <span className="rounded-md bg-[#eef1f6] px-2 py-0.5 text-[11px] font-semibold text-[#44556e]">
                  {product.priceListCount} listas
                </span>
              </div>

              {product.description ? (
                <p className="text-[12px] leading-[1.5] text-[#6b7787]">
                  {product.description}
                </p>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
