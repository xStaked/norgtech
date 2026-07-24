import Link from "next/link";
import { ProductForm } from "@/components/products/product-form";
import { apiFetch } from "@/lib/api.server";
import type { PriceListRef } from "@/lib/catalog";

export default async function NewProductPage() {
  const response = await apiFetch("/price-lists");
  const priceLists: PriceListRef[] = response.ok ? await response.json() : [];

  return (
    <div className="space-y-4">
      <nav className="flex items-center gap-[7px] text-[12.5px] text-muted-foreground">
        <Link href="/products" className="hover:text-foreground">
          ← Productos
        </Link>
        <span className="text-[#c2cbd6]">/</span>
        <span className="font-semibold text-foreground">Nuevo</span>
      </nav>

      <div>
        <h1 className="m-0 text-2xl font-extrabold tracking-[-.02em] text-foreground">
          Nuevo producto
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Mínimo una presentación. Los precios son opcionales y siempre van por (presentación,
          lista).
        </p>
      </div>

      <ProductForm priceLists={priceLists} />
    </div>
  );
}
