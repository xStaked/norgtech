import Link from "next/link";
import { apiFetch } from "@/lib/api.server";
import { PageHeader } from "@/components/ui/page-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardDescription, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

interface Segment {
  id: string;
  name: string;
  description: string | null;
  discountPercent: number;
  minGoalAmount: number;
  maxGoalAmount: number | null;
  active: boolean;
}

function formatGoalRange(min: number, max: number | null): string {
  const minFormatted = `$${(min / 1_000_000).toFixed(0)}M`;
  if (max === null) {
    return `Meta: > ${minFormatted}`;
  }
  const maxFormatted = `$${(max / 1_000_000).toFixed(0)}M`;
  return `Meta: ${minFormatted} - ${maxFormatted}`;
}

export default async function SegmentsPage() {
  const response = await apiFetch("/customer-segments");
  const segments: Segment[] = response.ok ? await response.json() : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Segmentos de cliente"
        actions={
          <Link
            href="/segments/new"
            className={cn(buttonVariants({ size: "sm" }))}
          >
            Nuevo segmento
          </Link>
        }
      />

      {segments.length === 0 ? (
        <EmptyState title="No hay segmentos registrados." />
      ) : (
        <div className="grid gap-3">
          {segments.map((segment) => (
            <Card key={segment.id} size="sm">
              <CardHeader className="has-data-[slot=card-action]:grid-cols-[1fr_auto]">
                <div>
                  <CardTitle>{segment.name}</CardTitle>
                  {segment.description && (
                    <CardDescription>{segment.description}</CardDescription>
                  )}
                </div>
                <div data-slot="card-action" className="col-start-2 row-span-2 row-start-1 self-start justify-self-end">
                  <Link
                    href={`/segments/${segment.id}`}
                    className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                  >
                    Editar
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">
                    Descuento: {segment.discountPercent}%
                  </span>
                  <span>{formatGoalRange(segment.minGoalAmount, segment.maxGoalAmount)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
