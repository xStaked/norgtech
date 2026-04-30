import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { ReportList } from "@/components/reports/report-list";
import { apiFetch } from "@/lib/api.server";

interface ReportApiItem {
  id: string;
  title: string;
  customerId: string;
  customer: { id: string; displayName: string } | null;
  createdAt: string;
  creator: { id: string; name: string } | null;
}

export default async function ReportsPage() {
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

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <PageHeader
        eyebrow="Inteligencia comercial"
        title="Reportes ejecutivos"
        description="Historial de reportes generados desde visitas completadas, con diagnóstico, costos, ROI y cotización."
      />

      <SectionCard
        title="Reportes generados"
        description="Consulta y descarga los reportes ejecutivos vinculados a tus clientes."
      >
        <ReportList reports={rows} />
      </SectionCard>
    </div>
  );
}
