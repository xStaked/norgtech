import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductForm } from "@/components/products/product-form";
import { apiFetch } from "@/lib/api.server";
import type { PriceListRef, ProductDetail } from "@/lib/catalog";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [productResponse, listsResponse] = await Promise.all([
    apiFetch(`/products/${id}`),
    apiFetch("/price-lists"),
  ]);

  if (!productResponse.ok) {
    notFound();
  }

  const product: ProductDetail = await productResponse.json();
  const priceLists: PriceListRef[] = listsResponse.ok ? await listsResponse.json() : [];

  return (
    <div className="space-y-4">
      <nav className="flex items-center gap-[7px] text-[12.5px] text-muted-foreground">
        <Link href="/products" className="hover:text-foreground">
          ← Productos
        </Link>
        <span className="text-[#c2cbd6]">/</span>
        <Link href={`/products/${id}`} className="hover:text-foreground">
          {product.name}
        </Link>
        <span className="text-[#c2cbd6]">/</span>
        <span className="font-semibold text-foreground">Editar</span>
      </nav>

      <div>
        <h1 className="m-0 text-2xl font-extrabold tracking-[-.02em] text-foreground">
          Editar producto
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Mínimo una presentación. Los precios son opcionales y siempre van por (presentación,
          lista).
        </p>
      </div>

      <ProductForm priceLists={priceLists} product={product} />
    </div>
  );
}
