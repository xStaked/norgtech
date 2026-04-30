import { ButtonLink } from "@/components/ui/button-link";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { apiFetch } from "@/lib/api.server";
import { FollowUpTaskForm } from "@/components/follow-ups/follow-up-task-form";

interface Customer {
  id: string;
  displayName: string;
}

interface Opportunity {
  id: string;
  title: string;
}

export default async function NewFollowUpPage() {
  const [customersRes, opportunitiesRes] = await Promise.all([
    apiFetch("/customers"),
    apiFetch("/opportunities"),
  ]);

  const customers: Customer[] = customersRes.ok ? await customersRes.json() : [];
  const opportunities: Opportunity[] = opportunitiesRes.ok ? await opportunitiesRes.json() : [];

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <PageHeader
        eyebrow="Seguimientos"
        title="Nueva tarea de seguimiento"
        description="Crea una acción comercial con fecha, tipo y relación directa con cliente u oportunidad."
        actions={
          <ButtonLink href="/follow-ups" variant="secondary">
            Volver a seguimientos
          </ButtonLink>
        }
      />

      <SectionCard
        title="Tarea operativa"
        description="Define el compromiso, su vencimiento y el contexto comercial asociado."
      >
        <FollowUpTaskForm customers={customers} opportunities={opportunities} />
      </SectionCard>
    </div>
  );
}
