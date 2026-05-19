import { ButtonLink } from "@/components/ui/button-link";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { apiFetch } from "@/lib/api.server";
import { OpportunityForm } from "@/components/opportunities/opportunity-form";

interface Customer {
  id: string;
  displayName: string;
}

export default async function NewOpportunityPage() {
  const response = await apiFetch("/customers");
  const customers: Customer[] = response.ok ? await response.json() : [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Oportunidades"
        title="Nueva oportunidad"
        actions={
          <ButtonLink href="/opportunities" variant="secondary">
            Volver a oportunidades
          </ButtonLink>
        }
      />
      <SectionCard>
        <OpportunityForm customers={customers} />
      </SectionCard>
    </div>
  );
}
