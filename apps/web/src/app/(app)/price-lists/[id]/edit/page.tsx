import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PriceListForm } from "@/components/price-lists/price-list-form";
import { SectionCard } from "@/components/ui/section-card";
import { apiFetch } from "@/lib/api.server";
import { getCurrentUser } from "@/lib/auth.server";

export default async function EditPriceListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const role = user?.role ?? null;
  if (!(role === "administrador" || role === "director_comercial" || role === "promotor")) {
    redirect("/dashboard?forbidden=1");
  }
  const res = await apiFetch(`/price-lists/${id}`);
  if (!res.ok) notFound();
  const list = (await res.json()) as { name: string; kind: string; currency: string; country: string | null };

  return (
    <div className="grid gap-4">
      <nav className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
        <Link href={`/price-lists/${id}`} className="hover:text-foreground">
          ← Volver a la lista
        </Link>
      </nav>
      <h1 className="m-0 text-2xl font-extrabold">Editar lista</h1>
      <SectionCard>
        <PriceListForm listId={id} initial={{ name: list.name, kind: list.kind, currency: list.currency, country: list.country ?? "" }} />
      </SectionCard>
    </div>
  );
}
