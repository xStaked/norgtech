import Link from "next/link";
import { apiFetch } from "@/lib/api.server";
import { formatPrice } from "@/lib/catalog";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button-link";
import { ListFilters } from "@/components/ui/list-filters";
import { StatusBadge } from "@/components/ui/status-badge";
import { applyFilters, optionsFrom, param, type SearchParams } from "@/lib/list-filter";
import { avatarColor, initials } from "@/lib/avatar";
import { buildQueryString } from "@/lib/query-string";

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

interface Customer {
  id: string;
  displayName: string;
  /** Sin lista de precios no hay catalogo que filtrar: no se ofrece. */
  priceListId: string | null;
}

function hasPrice(product: Product): boolean {
  return Object.keys(product.priceRange).length > 0;
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  // El filtro por cliente lo resuelve el API (necesita su lista de precios), no
  // applyFilters: el catalogo que llega ya viene recortado a ese cliente.
  const customerId = param(params, "customerId");
  const [response, customersResponse] = await Promise.all([
    apiFetch(`/products?${buildQueryString({ includeInactive: "true", customerId })}`),
    apiFetch("/customers"),
  ]);
  const all: Product[] = response.ok ? await response.json() : [];
  const customers: Customer[] = customersResponse.ok ? await customersResponse.json() : [];

  const products = applyFilters(all, params, {
    search: (product) => [product.name, product.sku, product.description],
    match: {
      unit: (product) => product.unit,
      active: (product) => String(product.active),
      priced: (product) => (hasPrice(product) ? "si" : "no"),
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
          {
            key: "customerId",
            allLabel: "Todos los clientes",
            options: customers
              .filter((customer) => customer.priceListId)
              .map((customer) => ({ value: customer.id, label: customer.displayName })),
          },
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
          {all.length > 0
            ? "Ningún producto coincide con los filtros."
            : customerId
              ? "Este cliente no tiene productos con precio en su lista."
              : "No hay productos registrados."}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <Link
              key={product.id}
              href={`/products/${product.id}`}
              className="group block rounded-[11px] border border-border bg-card p-4 transition-all hover:border-[#c7d3df] hover:shadow-[0_6px_18px_rgba(12,44,68,.08)]"
            >
              {/* Nombre y precio ya no comparten fila: el nombre se truncaba y
                  los 4 chips de metadatos desbordaban. Ahora van apilados. */}
              <div className="mb-3 flex items-start gap-2.5">
                <span
                  aria-hidden="true"
                  className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[9px] text-[12.5px] font-extrabold text-white"
                  style={{ backgroundColor: avatarColor(product.name) }}
                >
                  {initials(product.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14.5px] font-bold leading-[1.25] text-foreground">
                    {product.name}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[10.5px] font-semibold text-[#7a8696]">
                    {product.sku}
                  </div>
                </div>
                <span
                  aria-hidden="true"
                  title={hasPrice(product) ? "Con precio" : "Sin precio"}
                  className="mt-1.5 h-[7px] w-[7px] shrink-0 rounded-full"
                  style={{ backgroundColor: hasPrice(product) ? "#00a651" : "#f58221" }}
                />
              </div>

              <div className="mb-[11px] border-t border-[#f0f2f6] pt-[11px]">
                {/* Rango, no un precio único: el mismo producto vale distinto
                    en cada lista. Una moneda por línea, nunca convertidas. */}
                {!hasPrice(product) ? (
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-[#fdf0dc] px-2.5 py-0.5 text-[11.5px] font-bold text-[#9a6410]">
                      Sin precio
                    </span>
                    <span className="text-[11px] text-[#b3bcc8]">no está en ninguna lista</span>
                  </div>
                ) : (
                  <>
                    {Object.entries(product.priceRange).map(([currency, range]) => (
                      <div key={currency} className="mb-1 flex items-baseline gap-[9px]">
                        <span
                          className="w-[30px] shrink-0 rounded py-px text-center text-[9.5px] font-extrabold"
                          style={
                            currency === "USD"
                              ? { color: "#3d6b2f", backgroundColor: "#e8f0e6" }
                              : { color: "#0f5c8a", backgroundColor: "#e6f0f6" }
                          }
                        >
                          {currency}
                        </span>
                        <span
                          className="font-mono text-[12.5px] font-semibold tabular-nums"
                          style={{ color: currency === "USD" ? "#3d6b2f" : "#0c2c44" }}
                        >
                          {range.min === range.max
                            ? formatPrice(range.min, currency, true)
                            : `${formatPrice(range.min, currency, true)} – ${formatPrice(range.max, currency, true)}`}
                        </span>
                      </div>
                    ))}
                    {/* Una sola nota de IVA para todas las monedas, no una por fila. */}
                    <div className="pl-[39px] text-[10px] text-[#b3bcc8]">rango sin IVA</div>
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-[#6b7787]">
                {!product.active ? (
                  <>
                    <StatusBadge tone="neutral">Inactivo</StatusBadge>
                    <span className="text-[#d5dbe3]">·</span>
                  </>
                ) : null}
                <span className="font-semibold text-[#44556e]">{product.unit}</span>
                <span className="text-[#d5dbe3]">·</span>
                <span>{product.presentationCount} present.</span>
                <span className="text-[#d5dbe3]">·</span>
                <span>{product.priceListCount} listas</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
