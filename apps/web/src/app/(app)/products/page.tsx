import Link from "next/link";
import { apiFetch } from "@/lib/api.server";
import { formatPrice } from "@/lib/catalog";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button-link";
import { FilterBar } from "@/components/ui/filter-bar";
import { StatusBadge } from "@/components/ui/status-badge";

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

export default async function ProductsPage() {
  const response = await apiFetch("/products?includeInactive=true");
  const products: Product[] = response.ok ? await response.json() : [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="CATÁLOGO"
        title={`Productos · ${products.length}`}
        actions={
          <>
            <ButtonLink href="/products" variant="secondary">
              Exportar
            </ButtonLink>
            <ButtonLink href="/products/new">Nuevo producto</ButtonLink>
          </>
        }
      />

      <FilterBar>
        <div className="flex h-[38px] min-w-[260px] items-center rounded-lg border border-input bg-card px-3 text-[13px] text-muted-foreground">
          Buscar producto o SKU…
        </div>
        <button
          type="button"
          className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-input bg-card px-3 text-[13px] font-semibold text-foreground hover:bg-muted"
        >
          Categoría
        </button>
        <button
          type="button"
          className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-input bg-card px-3 text-[13px] font-semibold text-foreground hover:bg-muted"
        >
          Unidad
        </button>
      </FilterBar>

      {products.length === 0 ? (
        <p className="text-muted-foreground">No hay productos registrados.</p>
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
