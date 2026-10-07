import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SpecialRevisionEditForm } from "@/components/price-lists/special-revision-edit-form";
import { SectionCard } from "@/components/ui/section-card";
import { apiFetch } from "@/lib/api.server";
import { getCurrentUser } from "@/lib/auth.server";

export default async function EditSpecialPriceListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const role = user?.role ?? null;
  const allowed = role === "comercial" || role === "administrador" || role === "director_comercial" || role === "promotor";
  if (!allowed) redirect("/dashboard?forbidden=1");

  const res = await apiFetch(`/special-price-lists/${id}`);
  if (!res.ok) notFound();
  const list = (await res.json()) as {
    ownerUserId: string;
    revisions: Array<{
      id: string;
      revision: number;
      status: string;
      items: Array<{
        customerId: string;
        presentationId: string;
        priceSinIva: string | number | null;
        priceConIva: string | number | null;
        taxPercent: string | number | null;
        customer?: { displayName: string; currency: string } | null;
        presentation?: { empaque: string } | null;
      }>;
    }>;
  };
  const revision = [...(list.revisions ?? [])].sort((a, b) => b.revision - a.revision)[0];
  if (!revision) notFound();

  return (
    <div className="grid gap-4">
      <nav className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
        <Link href={`/price-lists/special/${id}`} className="hover:text-foreground">
          ← Volver a la lista especial
        </Link>
      </nav>
      <h1 className="m-0 text-2xl font-extrabold">Corregir lista especial</h1>
      <SectionCard title={`Revisión ${revision.revision} · ${revision.status}`} description="Corrige precios y reenvía a revisión.">
        <SpecialRevisionEditForm
          listId={id}
          revisionId={revision.id}
          initial={revision.items.map((item) => ({
            customerId: item.customerId,
            customerName: item.customer?.displayName ?? item.customerId,
            currency: item.customer?.currency ?? "COP",
            presentationId: item.presentationId,
            presentationName: item.presentation?.empaque ?? item.presentationId,
            sinIva: item.priceSinIva == null ? "" : String(item.priceSinIva),
            conIva: item.priceConIva == null ? "" : String(item.priceConIva),
            tax: item.taxPercent == null ? "" : String(item.taxPercent),
          }))}
        />
      </SectionCard>
    </div>
  );
}
