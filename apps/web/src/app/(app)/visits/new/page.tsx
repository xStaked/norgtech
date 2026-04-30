import { ButtonLink } from "@/components/ui/button-link";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { apiFetch } from "@/lib/api.server";
import { VisitForm } from "@/components/visits/visit-form";

interface Customer {
  id: string;
  displayName: string;
}

interface Opportunity {
  id: string;
  title: string;
}

export default async function NewVisitPage() {
  const [customersRes, opportunitiesRes] = await Promise.all([
    apiFetch("/customers"),
    apiFetch("/opportunities"),
  ]);

  const customers: Customer[] = customersRes.ok ? await customersRes.json() : [];
  const opportunities: Opportunity[] = opportunitiesRes.ok ? await opportunitiesRes.json() : [];

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <PageHeader
        eyebrow="Visitas"
        title="Nueva visita"
        description="Programa una visita comercial con contexto de cliente, oportunidad y siguiente paso esperado."
        actions={
          <ButtonLink href="/visits" variant="secondary">
            Volver a visitas
          </ButtonLink>
        }
      />

      <SectionCard
        title="Programación de visita"
        description="Registra fecha, resumen y contexto comercial de la gestión en campo."
      >
        <VisitForm customers={customers} opportunities={opportunities} />
      </SectionCard>
    </div>
  );
}
