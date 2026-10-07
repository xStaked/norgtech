import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ButtonLink } from "@/components/ui/button-link";
import { SpecialPriceListReviewActions } from "@/components/price-lists/special-price-list-review-actions";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { DetailSection } from "@/components/ui/detail-section";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiFetch } from "@/lib/api.server";
import { getCurrentUser } from "@/lib/auth.server";
import { formatPrice } from "@/lib/catalog";

interface SpecialItem {
  id: string;
  customerId: string;
  presentationId: string;
  priceSinIva: string | number | null;
  priceConIva: string | number | null;
  taxPercent: string | number | null;
  customer?: { id: string; displayName: string; currency: string } | null;
  presentation?: { id: string; empaque: string } | null;
}

interface SpecialRevision {
  id: string;
  revision: number;
  status: string;
  active: boolean;
  items: SpecialItem[];
}

interface SpecialDetail {
  id: string;
  name: string;
  ownerUserId: string;
  active: boolean;
  revisions: SpecialRevision[];
}

export default async function SpecialPriceListDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const role = user?.role ?? null;
  const allowed = role === "comercial" || role === "administrador" || role === "director_comercial" || role === "promotor";
  if (!allowed) redirect("/dashboard?forbidden=1");

  const res = await apiFetch(`/special-price-lists/${id}`);
  if (!res.ok) notFound();
  const list = (await res.json()) as SpecialDetail;
  const revision = [...(list.revisions ?? [])].sort((a, b) => b.revision - a.revision)[0];
  const canManage = role === "administrador" || role === "director_comercial" || role === "promotor";
  const isOwner = user?.id === list.ownerUserId;
  const canSubmit = canManage || (role === "comercial" && isOwner);

  const rows = (revision?.items ?? []).map((item) => ({
    id: item.id,
    customer: item.customer?.displayName ?? item.customerId,
    currency: item.customer?.currency ?? "COP",
    presentation: item.presentation?.empaque ?? item.presentationId,
    sinIva: item.priceSinIva == null ? null : String(item.priceSinIva),
    conIva: item.priceConIva == null ? null : String(item.priceConIva),
  }));

  const columns: readonly DataTableColumn<(typeof rows)[number]>[] = [
    { key: "customer", header: "Cliente", render: (r) => r.customer },
    { key: "presentation", header: "Presentación", render: (r) => r.presentation },
    { key: "sin", header: "Sin IVA", align: "right", render: (r) => formatPrice(r.sinIva, r.currency) || "—" },
    { key: "con", header: "Con IVA", align: "right", render: (r) => formatPrice(r.conIva, r.currency) || "—" },
  ];

  return (
    <div className="grid gap-4">
      <PageHeader
        eyebrow="Catálogo · Lista especial"
        title={list.name}
        description={`Revisión ${revision?.revision ?? "—"} · ${revision?.status ?? ""}`}
        actions={
          <>
            {(canSubmit || canManage) && revision && (revision.status === "borrador" || revision.status === "rechazada") ? (
              <ButtonLink href={`/price-lists/special/${list.id}/edit`} variant="secondary">
                Corregir precios
              </ButtonLink>
            ) : null}
            <ButtonLink href="/price-lists" variant="secondary">
              Volver a listas
            </ButtonLink>
          </>
        }
      />
      <DetailSection
        title="Estado"
        fields={[
          { label: "Estado", value: <StatusBadge tone={list.active ? "success" : "neutral"}>{list.active ? "Activa" : "Inactiva"}</StatusBadge> },
          { label: "Revisión", value: revision ? `${revision.revision} · ${revision.status}${revision.active ? " · vigente" : ""}` : "—" },
        ]}
      />
      <SectionCard
        title="Precios por cliente"
        description="Cada fila guarda un precio distinto por cliente y presentación. La moneda viene del cliente."
        actions={
          revision ? (
            <SpecialPriceListReviewActions
              listId={list.id}
              revisionId={revision.id}
              status={revision.status}
              canSubmit={canSubmit}
              canReview={canManage}
            />
          ) : undefined
        }
      >
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(r) => r.id}
          emptyState={<EmptyState title="Sin precios" description="Esta revisión aún no tiene filas." />}
        />
      </SectionCard>
      <p className="text-[12px] text-muted-foreground">
        <Link href="/price-lists" className="text-[#0f5c8a]">Volver a listas</Link>
      </p>
    </div>
  );
}
