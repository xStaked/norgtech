import Link from "next/link";
import { PriceListForm } from "@/components/price-lists/price-list-form";
import { SectionCard } from "@/components/ui/section-card";
import { getCurrentUser } from "@/lib/auth.server";
import { redirect } from "next/navigation";

export default async function NewPriceListPage() {
  const user = await getCurrentUser();
  const role = user?.role ?? null;
  const canManage = role === "administrador" || role === "director_comercial" || role === "promotor";
  if (!canManage) redirect("/dashboard?forbidden=1");

  return (
    <div className="grid gap-4">
      <nav className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
        <Link href="/price-lists" className="hover:text-foreground">
          ← Listas de precios
        </Link>
        <span>/</span>
        <span className="font-semibold text-foreground">Nueva</span>
      </nav>
      <h1 className="m-0 text-2xl font-extrabold">Nueva lista de precios</h1>
      <SectionCard title="Datos de la lista" description="La lista nace inactiva hasta que la actives.">
        <PriceListForm />
      </SectionCard>
    </div>
  );
}
