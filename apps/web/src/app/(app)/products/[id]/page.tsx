import Link from "next/link";
import { notFound } from "next/navigation";
import { ButtonLink } from "@/components/ui/button-link";
import { StatusBadge } from "@/components/ui/status-badge";
import { PresentationsCard } from "@/components/products/presentations-card";
import { PriceMatrix } from "@/components/products/price-matrix";
import { apiFetch } from "@/lib/api.server";
import { canCreate } from "@/lib/auth";
import { getCurrentUser } from "@/lib/auth.server";
import type { ProductDetail } from "@/lib/catalog";

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

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [productResponse, listsResponse, user] = await Promise.all([
    apiFetch(`/products/${id}`),
    apiFetch("/price-lists"),
    getCurrentUser(),
  ]);

  if (!productResponse.ok) {
    notFound();
  }

  const product: ProductDetail = await productResponse.json();
  const totalLists: number = listsResponse.ok ? (await listsResponse.json()).length : 0;
  const canEdit = canCreate(user?.role ?? null, "product");

  const activePresentations = product.presentations.filter((p) => p.active);
  const pricedLists = product.priceLists.length;

  return (
    <div className="space-y-4">
      <nav className="flex items-center gap-[7px] text-[12.5px] text-muted-foreground">
        <Link href="/products" className="hover:text-foreground">
          ← Productos
        </Link>
        <span className="text-[#c2cbd6]">/</span>
        <span className="font-semibold text-foreground">{product.name}</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-[15px] font-extrabold text-white"
            style={{ backgroundColor: avatarColor(product.name) }}
          >
            {initials(product.name)}
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="m-0 text-2xl font-extrabold tracking-[-.02em] text-foreground">
                {product.name}
              </h1>
              <StatusBadge tone={product.active ? "success" : "neutral"}>
                {product.active ? "Activo" : "Inactivo"}
              </StatusBadge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="rounded-[5px] bg-[#e6f0f6] px-2 py-0.5 font-mono text-[11.5px] font-semibold text-[#0f5c8a]">
                {product.sku}
              </span>
              <span className="rounded-[5px] bg-[#eef1f6] px-2 py-0.5 text-[11.5px] font-semibold text-[#44556e]">
                {product.unit}
              </span>
              <span className="text-[12.5px] text-muted-foreground">
                {activePresentations.length} presentaciones · precio en {pricedLists} listas
              </span>
            </div>
          </div>
        </div>

        {canEdit ? (
          <div className="flex gap-2.5">
            <ButtonLink href={`/products/${id}/edit`} variant="secondary" size="sm">
              Editar
            </ButtonLink>
          </div>
        ) : null}
      </div>

      {product.description ? (
        <p className="max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
          {product.description}
        </p>
      ) : null}

      <PresentationsCard
        productId={product.id}
        presentations={product.presentations}
        canEdit={canEdit}
      />

      <PriceMatrix
        presentations={activePresentations}
        priceLists={product.priceLists}
        totalLists={totalLists}
      />
    </div>
  );
}
