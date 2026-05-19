import Link from "next/link";
import { SegmentForm } from "@/components/segments/segment-form";
import { PageHeader } from "@/components/ui/page-header";
import { buttonVariants } from "@/components/ui/button";

export default function NewSegmentPage() {
  return (
    <div className="space-y-6">
      <Link
        href="/segments"
        className={buttonVariants({ variant: "ghost", size: "sm" })}
      >
        ← Volver
      </Link>

      <PageHeader title="Nuevo segmento" />

      <SegmentForm />
    </div>
  );
}
