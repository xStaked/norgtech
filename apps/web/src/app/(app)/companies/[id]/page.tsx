import { ButtonLink } from "@/components/ui/button-link";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { apiFetch } from "@/lib/api.server";
import { notFound } from "next/navigation";
import { CompanyEditForm } from "./company-edit-form";

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const response = await apiFetch(`/companies/${id}`);
  if (!response.ok) notFound();

  const company = await response.json();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Empresas"
        title={company.name}
        actions={
          <ButtonLink href="/companies" variant="secondary">
            Volver a empresas
          </ButtonLink>
        }
      />
      <SectionCard>
        <CompanyEditForm company={company} />
      </SectionCard>
    </div>
  );
}
