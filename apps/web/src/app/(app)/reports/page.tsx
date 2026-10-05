import { ListFilters } from "@/components/ui/list-filters";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { ReportList } from "@/components/reports/report-list";
import { PendingReportsList } from "@/components/reports/pending-reports-list";
import { apiFetch } from "@/lib/api.server";
import { getCurrentUser } from "@/lib/auth.server";
import { canCreate } from "@/lib/auth";
import { applyFilters, optionsFrom, type SearchParams } from "@/lib/list-filter";
import { pendingReportVisits } from "@/lib/pending-reports";

interface ReportApiItem {
  id: string;
  title: string;
  customerId: string;
  customer: { id: string; displayName: string } | null;
  visitId?: string | null;
  visit?: { id: string } | null;
  createdAt: string;
  creator: { id: string; name: string } | null;
}

interface VisitApiItem {
  id: string;
  status: string;
  summary: string | null;
  scheduledAt: string;
  completedAt: string | null;
  customer: { id: string; displayName: string } | null;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const [reportsResponse, visitsResponse, user] = await Promise.all([
    apiFetch("/reports"),
    apiFetch("/visits?status=completada"),
    getCurrentUser(),
  ]);
  const reports = (reportsResponse.ok ? await reportsResponse.json() : []) as ReportApiItem[];
  const visits = (visitsResponse.ok ? await visitsResponse.json() : []) as VisitApiItem[];
  const canGenerate = canCreate(user?.role ?? null, "report");

  const pending = canGenerate
    ? pendingReportVisits(visits, reports).map((v) => ({
        id: v.id,
        customerName: v.customer?.displayName ?? null,
        customerId: v.customer?.id ?? null,
        completedAt: v.completedAt,
        scheduledAt: v.scheduledAt,
        summary: v.summary,
      }))
    : [];

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
        description="Genera reportes desde visitas completadas y consulta el historial con diagnóstico, costos, ROI y cotización."
      />

      {pending.length > 0 ? (
        <SectionCard
          title="Pendientes por generar"
          description="Visitas completadas con resumen y aún sin reporte. Genéralos sin ir a cada visita."
        >
          <PendingReportsList visits={pending} />
        </SectionCard>
      ) : null}

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
