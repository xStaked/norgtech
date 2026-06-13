import { ButtonLink } from "@/components/ui/button-link";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { CompanyForm } from "./company-form";

export default function NewCompanyPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Empresas"
        title="Nueva empresa"
        actions={
          <ButtonLink href="/companies" variant="secondary">
            Volver a empresas
          </ButtonLink>
        }
      />
      <SectionCard>
        <CompanyForm />
      </SectionCard>
    </div>
  );
}
