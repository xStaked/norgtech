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
import { dateTimeFormatter } from "@/lib/datetime";
import { getCurrentUser } from "@/lib/auth.server";
import { canCreate } from "@/lib/auth";

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
  /** Derivado por el API con la regla compartida. El front no lo recalcula. */
  isOverdue: boolean;
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


const linkStyle = {
  color: "#0c2c44",
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
  const user = await getCurrentUser();
  const userRole = user?.role ?? null;
  const scheduledAt = dateTimeFormatter.format(new Date(visit.scheduledAt));
  // "Vencida" es estado derivado; la columna solo guarda decisiones humanas.
  const statusLabel = visit.isOverdue ? "Vencida" : statusLabels[visit.status] ?? visit.status;
  const statusTone: CrmStatusTone = visit.isOverdue
    ? "danger"
    : statusTones[visit.status] ?? "neutral";
  const createdAt = dateTimeFormatter.format(new Date(visit.createdAt));

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <PageHeader
        eyebrow="Operacion en campo"
        title={visit.summary}
        description="Detalle operativo de la visita, su contexto comercial y el siguiente movimiento esperado."
        actions={
          <>
            <StatusBadge tone={statusTone}>
              {statusLabel}
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
        <InlineMetric label="Agenda" value={scheduledAt} tone={statusTone} />
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
            value: statusLabel,
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
          <p style={{ margin: 0, color: "#0c2c44", lineHeight: 1.7 }}>{visit.notes}</p>
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

      {visit.status === "completada" && canCreate(userRole, "report") ? (
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
