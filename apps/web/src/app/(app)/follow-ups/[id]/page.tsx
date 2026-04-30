import Link from "next/link";
import { notFound } from "next/navigation";
import { FollowUpActions } from "@/components/follow-ups/follow-up-actions";
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

interface FollowUpTask {
  id: string;
  customer: Customer | null;
  opportunity: Opportunity | null;
  type: string;
  title: string;
  dueAt: string;
  notes: string | null;
  status: string;
  createdAt: string;
}

const statusLabels: Record<string, string> = {
  pendiente: "Pendiente",
  completada: "Completada",
  vencida: "Vencida",
};

const statusTones: Record<string, CrmStatusTone> = {
  pendiente: "warning",
  completada: "success",
  vencida: "danger",
};

const typeLabels: Record<string, string> = {
  llamada: "Llamada",
  email: "Email",
  whatsapp: "WhatsApp",
  reunion: "Reunion",
  recordatorio: "Recordatorio",
  otro: "Otro",
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

export default async function FollowUpDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const response = await apiFetch(`/follow-up-tasks/${id}`);

  if (!response.ok) {
    notFound();
  }

  const task: FollowUpTask = await response.json();
  const dueAt = dateTimeFormatter.format(new Date(task.dueAt));
  const createdAt = dateTimeFormatter.format(new Date(task.createdAt));

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <PageHeader
        eyebrow="Gestion comercial"
        title={task.title}
        description="Detalle de la tarea, su canal de seguimiento y el contexto comercial asociado para decidir la siguiente accion."
        actions={
          <>
            <StatusBadge tone={statusTones[task.status] ?? "neutral"}>
              {statusLabels[task.status] ?? task.status}
            </StatusBadge>
            <ButtonLink href="/follow-ups" variant="ghost" size="sm">
              Volver a seguimientos
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
        <InlineMetric label="Vence" value={dueAt} tone={statusTones[task.status] ?? "info"} />
        <InlineMetric label="Canal" value={typeLabels[task.type] ?? task.type} />
        <InlineMetric label="Registro" value={`#${task.id.slice(-6)}`} />
      </div>

      <DetailSection
        title="Contexto del seguimiento"
        description="Mantiene visible la relacion entre la tarea, el cliente y la oportunidad para ejecutar priorizacion diaria."
        fields={[
          {
            label: "Cliente",
            value: task.customer ? (
              <Link href={`/customers/${task.customer.id}`} style={linkStyle}>
                {task.customer.displayName}
              </Link>
            ) : (
              "Sin cliente"
            ),
          },
          {
            label: "Oportunidad",
            value: task.opportunity ? (
              <Link href={`/opportunities/${task.opportunity.id}`} style={linkStyle}>
                {task.opportunity.title}
              </Link>
            ) : (
              "Sin oportunidad"
            ),
          },
          {
            label: "Tipo",
            value: typeLabels[task.type] ?? task.type,
          },
          {
            label: "Fecha de vencimiento",
            value: dueAt,
          },
          {
            label: "Estado",
            value: statusLabels[task.status] ?? task.status,
          },
          {
            label: "Creada",
            value: createdAt,
          },
        ]}
      />

      {task.notes ? (
        <SectionCard
          title="Notas"
          description="Observaciones y contexto operativo registrados para resolver la tarea."
        >
          <p style={{ margin: 0, color: "#10233f", lineHeight: 1.7 }}>{task.notes}</p>
        </SectionCard>
      ) : null}

      {task.status !== "completada" ? (
        <SectionCard
          title="Acciones"
          description="Ejecuta el cambio de estado o completa la tarea desde este detalle."
        >
          <FollowUpActions taskId={task.id} />
        </SectionCard>
      ) : null}
    </div>
  );
}
