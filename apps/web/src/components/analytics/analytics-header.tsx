import type { ReactNode } from "react";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { analyticsQuery, type SearchParams } from "@/lib/analytics";

/**
 * Encabezado comun de las 4 pantallas: mismo eyebrow, mismo boton de CSV, y el
 * CSV siempre arrastra los filtros vigentes (si no, exportaria otra cosa que la
 * que se esta mirando).
 */
export function AnalyticsHeader({
  title,
  description,
  screen,
  params,
  extraActions,
}: {
  title: string;
  description: string;
  screen: string;
  params: SearchParams;
  extraActions?: ReactNode;
}) {
  const query = analyticsQuery(params);
  const href = `/analytics/csv?screen=${screen}${query ? `&${query}` : ""}`;

  return (
    <PageHeader
      eyebrow="Analítica"
      title={title}
      description={description}
      actions={
        <>
          {extraActions}
          <a
            href={href}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-input bg-card px-3.5 text-[13px] font-bold text-secondary-foreground transition-colors hover:bg-muted"
          >
            <Download className="h-[15px] w-[15px]" aria-hidden="true" />
            Exportar CSV
          </a>
        </>
      }
    />
  );
}
