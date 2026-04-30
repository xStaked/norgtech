import Link from "next/link";
import { notFound } from "next/navigation";
import { VisitActions } from "@/components/visits/visit-actions";
import { ReportGenerateButton } from "@/components/reports/report-generate-button";
import { ButtonLink } from "@/components/ui/button-link";
import { DetailSection } from "@/components/ui/detail-section";
import { InlineMetric } from "@/components/ui/inline-metric";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import type { CrmStatusTone } from "@/components/ui/theme";
import { apiFetch } from "@/lib/api.server";

interface Customer {
  id: string;
  displayName: string;
}

interface Opportunity {
  id: string;
  title: string;
}

interface Visit {
  id: string;
  customer: Customer | null;
  opportunity: Opportunity | null;
  scheduledAt: string;
  summary: string;
  notes: string | null;
  nextStep: string | null;
  status: string;
  createdAt: string;
}

const statusLabels: Record<string, string> = {
  programada: "Programada",
  completada: "Completada",
  cancelada: "Cancelada",
  no_realizada: "No realizada",
};

const statusTones: Record<string, CrmStatusTone> = {
  programada: "warning",
  completada: "success",
  cancelada: "danger",
  no_realizada: "neutral",
};

const dateTimeFormatter = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
  timeStyle: "short",
});

const linkStyle = {
  color: "#10233f",
  fontWeight: 700,
  textDecoration: "none",
} as const;

export default async function VisitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const response = await apiFetch(`/visits/${id}`);

  if (!response.ok) {
    notFound();
  }

  const visit: Visit = await response.json();
  const scheduledAt = dateTimeFormatter.format(new Date(visit.scheduledAt));
  const createdAt = dateTimeFormatter.format(new Date(visit.createdAt));

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <PageHeader
        eyebrow="Operacion en campo"
        title={visit.summary}
        description="Detalle operativo de la visita, su contexto comercial y el siguiente movimiento esperado."
        actions={
          <>
            <StatusBadge tone={statusTones[visit.status] ?? "neutral"}>
              {statusLabels[visit.status] ?? visit.status}
            </StatusBadge>
            <ButtonLink href="/visits" variant="ghost" size="sm">
              Volver a visitas
            </ButtonLink>
          </>
        }
      />

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <InlineMetric label="Agenda" value={scheduledAt} tone={statusTones[visit.status] ?? "info"} />
        <InlineMetric label="Registro" value={`#${visit.id.slice(-6)}`} />
      </div>

      <DetailSection
        title="Contexto de la visita"
        description="Consulta el cliente vinculado, la oportunidad asociada y los hitos básicos para ejecutar o auditar la visita."
        fields={[
          {
            label: "Cliente",
            value: visit.customer ? (
              <Link href={`/customers/${visit.customer.id}`} style={linkStyle}>
                {visit.customer.displayName}
              </Link>
            ) : (
              "Sin cliente"
            ),
          },
          {
            label: "Oportunidad",
            value: visit.opportunity ? (
              <Link href={`/opportunities/${visit.opportunity.id}`} style={linkStyle}>
                {visit.opportunity.title}
              </Link>
            ) : (
              "Sin oportunidad"
            ),
          },
          {
            label: "Fecha programada",
            value: scheduledAt,
          },
          {
            label: "Siguiente paso",
            value: visit.nextStep ?? "Sin siguiente paso definido",
          },
          {
            label: "Estado",
            value: statusLabels[visit.status] ?? visit.status,
          },
          {
            label: "Creada",
            value: createdAt,
          },
        ]}
      />

      {visit.notes ? (
        <SectionCard
          title="Notas"
          description="Registro cualitativo capturado durante la preparacion o ejecucion de la visita."
        >
          <p style={{ margin: 0, color: "#10233f", lineHeight: 1.7 }}>{visit.notes}</p>
        </SectionCard>
      ) : null}

      {visit.status === "programada" ? (
        <SectionCard
          title="Acciones"
          description="Actualiza el resultado de la visita sin salir del detalle."
        >
          <VisitActions visitId={visit.id} />
        </SectionCard>
      ) : null}

      {visit.status === "completada" ? (
        <SectionCard
          title="Reporte ejecutivo"
          description="Genera un documento ejecutivo con diagnóstico, costos, ROI y cotización a partir de esta visita."
        >
          <ReportGenerateButton visitId={visit.id} />
        </SectionCard>
      ) : null}
    </div>
  );
}
