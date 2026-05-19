import Link from "next/link";
import { apiFetch } from "@/lib/api.server";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { SegmentForm } from "@/components/segments/segment-form";

interface Segment {
  id: string;
  name: string;
  description: string | null;
  discountPercent: number;
  minGoalAmount: number;
  maxGoalAmount: number | null;
  active: boolean;
}

export default async function EditSegmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const response = await apiFetch(`/customer-segments/${id}`);

  if (!response.ok) {
    return (
      <div className="space-y-6">
        <Link
          href="/segments"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          ← Volver
        </Link>

        <EmptyState
          title="Segmento no encontrado"
          description="El segmento que intentas editar no existe o ha sido eliminado."
        />
      </div>
    );
  }

  const segment: Segment = await response.json();

  return (
    <div className="space-y-6">
      <Link
        href="/segments"
        className={buttonVariants({ variant: "ghost", size: "sm" })}
      >
        ← Volver
      </Link>

      <PageHeader title={`Editar segmento: ${segment.name}`} />

      <SegmentForm segment={segment} />
    </div>
  );
}
