import { ListFilters } from "@/components/ui/list-filters";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { ReportList } from "@/components/reports/report-list";
import { apiFetch } from "@/lib/api.server";
import { applyFilters, optionsFrom, type SearchParams } from "@/lib/list-filter";

interface ReportApiItem {
  id: string;
  title: string;
  customerId: string;
  customer: { id: string; displayName: string } | null;
  createdAt: string;
  creator: { id: string; name: string } | null;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const response = await apiFetch("/reports");
  const reports: ReportApiItem[] = response.ok ? await response.json() : [];

  const rows = reports.map((report) => ({
    id: report.id,
    title: report.title,
    customerName: report.customer?.displayName ?? null,
    customerId: report.customer?.id ?? null,
    createdAt: report.createdAt,
    creatorName: report.creator?.name ?? null,
  }));

  const filtered = applyFilters(rows, params, {
    search: (row) => [row.title, row.customerName, row.creatorName],
    match: { creatorName: (row) => row.creatorName },
  });

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <PageHeader
        eyebrow="Inteligencia comercial"
        title="Reportes ejecutivos"
        description="Historial de reportes generados desde visitas completadas, con diagnóstico, costos, ROI y cotización."
      />

      <ListFilters
        searchPlaceholder="Buscar por título, cliente o autor"
        selects={[
          {
            key: "creatorName",
            allLabel: "Todos los autores",
            options: optionsFrom(rows, (row) => row.creatorName),
          },
        ]}
        shown={filtered.length}
        total={rows.length}
        noun="reportes"
      />

      <SectionCard
        title="Reportes generados"
        description="Consulta y descarga los reportes ejecutivos vinculados a tus clientes."
      >
        <ReportList reports={filtered} />
      </SectionCard>
    </div>
  );
}
