import Link from "next/link";
import { notFound } from "next/navigation";
import { ButtonLink } from "@/components/ui/button-link";
import { DetailSection } from "@/components/ui/detail-section";
import { InlineMetric } from "@/components/ui/inline-metric";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { ReportPayloadViewer } from "@/components/reports/report-payload-viewer";
import { apiFetch } from "@/lib/api.server";

interface ReportApiResponse {
  id: string;
  title: string;
  customerId: string;
  customer: { id: string; displayName: string; legalName: string } | null;
  visitId: string | null;
  payload: Record<string, unknown>;
  fileUrl: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  creator: { id: string; name: string; email: string } | null;
}

const dateFormatter = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const linkStyle = {
  color: "#2d6cdf",
  fontWeight: 700,
  textDecoration: "none",
} as const;

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const response = await apiFetch(`/reports/${id}`);

  if (!response.ok) {
    notFound();
  }

  const report: ReportApiResponse = await response.json();
  const createdAt = dateFormatter.format(new Date(report.createdAt));

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <PageHeader
        eyebrow="Reporte ejecutivo"
        title={report.title}
        description={`Generado el ${createdAt} por ${report.creator?.name ?? "—"}.`}
        actions={
          <>
            <ButtonLink href="/reports" variant="ghost" size="sm">
              Volver a reportes
            </ButtonLink>
            <ButtonLink href={`/reports/${id}/pdf`} variant="secondary" size="sm">
              Descargar PDF
            </ButtonLink>
          </>
        }
      />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <InlineMetric label="Registro" value={`#${report.id.slice(-6)}`} />
        <InlineMetric label="Cliente" value={report.customer?.displayName ?? "—"} tone="info" />
      </div>

      <DetailSection
        title="Metadatos del reporte"
        description="Información de contexto sobre quién generó el reporte y su vínculo comercial."
        fields={[
          {
            label: "Cliente",
            value: report.customer ? (
              <Link href={`/customers/${report.customer.id}`} style={linkStyle}>
                {report.customer.displayName}
              </Link>
            ) : (
              "Sin cliente"
            ),
          },
          {
            label: "Visita",
            value: report.visitId ? (
              <Link href={`/visits/${report.visitId}`} style={linkStyle}>
                Ver visita #{report.visitId.slice(-6)}
              </Link>
            ) : (
              "Sin visita vinculada"
            ),
          },
          {
            label: "Generado por",
            value: report.creator?.name ?? "—",
          },
          {
            label: "Fecha de generación",
            value: createdAt,
          },
        ]}
      />

      <SectionCard
        title="Contenido del reporte"
        description="Diagnóstico, problemas, solución, costos, ROI y cotización en un solo documento ejecutivo."
      >
        <ReportPayloadViewer payload={report.payload as unknown as Parameters<typeof ReportPayloadViewer>[0]["payload"]} />
      </SectionCard>
    </div>
  );
}
