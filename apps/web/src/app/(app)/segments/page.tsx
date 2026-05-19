import Link from "next/link";
import { apiFetch } from "@/lib/api.server";
import { PageHeader } from "@/components/ui/page-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

interface Segment {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
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
              <CardHeader>
                <CardTitle>{segment.name}</CardTitle>
                {segment.description && (
                  <CardDescription>{segment.description}</CardDescription>
                )}
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
