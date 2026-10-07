import Link from "next/link";
import { redirect } from "next/navigation";
import { SpecialPriceListForm } from "@/components/price-lists/special-price-list-form";
import { SectionCard } from "@/components/ui/section-card";
import { apiFetch } from "@/lib/api.server";
import { getCurrentUser } from "@/lib/auth.server";

export default async function NewSpecialPriceListPage() {
  const user = await getCurrentUser();
  const role = user?.role ?? null;
  const allowed = role === "comercial" || role === "administrador" || role === "director_comercial" || role === "promotor";
  if (!allowed) redirect("/dashboard?forbidden=1");

  const [customersRes, productsRes] = await Promise.all([apiFetch("/customers"), apiFetch("/products")]);
  const customers = (customersRes.ok ? await customersRes.json().catch(() => []) : []) as Array<{
    id: string;
    displayName: string;
    currency: string;
  }>;
  const products = (productsRes.ok ? await productsRes.json().catch(() => []) : []) as Array<{
    id: string;
    name: string;
    presentations?: Array<{ id: string; empaque: string }>;
  }>;

  return (
    <div className="grid gap-4">
      <nav className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
        <Link href="/price-lists" className="hover:text-foreground">
          ← Listas de precios
        </Link>
        <span>/</span>
        <span className="font-semibold text-foreground">Nueva especial</span>
      </nav>
      <h1 className="m-0 text-2xl font-extrabold">Nueva lista especial</h1>
      <p className="text-[13px] text-muted-foreground">
        Elige cliente, producto y presentación por fila. La moneda viene del cliente y no se puede cambiar.
      </p>
      <SectionCard title="Precios especiales por cliente">
        <SpecialPriceListForm
          customers={customers.map((c) => ({ id: c.id, displayName: c.displayName, currency: c.currency }))}
          products={products.map((p) => ({
            id: p.id,
            name: p.name,
            presentations: (p.presentations ?? []).map((pres) => ({ id: pres.id, empaque: pres.empaque })),
          }))}
        />
      </SectionCard>
    </div>
  );
}
