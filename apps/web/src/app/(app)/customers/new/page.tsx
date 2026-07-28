import { ButtonLink } from "@/components/ui/button-link";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { apiFetch } from "@/lib/api.server";
import { CustomerForm } from "@/components/customers/customer-form";
import type { PriceListRef } from "@/lib/catalog";

export default async function NewCustomerPage() {
  const companiesResponse = await apiFetch("/companies");
  const companies = companiesResponse.ok ? await companiesResponse.json() : [];

  const priceListsResponse = await apiFetch("/price-lists");
  const priceLists: PriceListRef[] = priceListsResponse.ok
    ? await priceListsResponse.json()
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Clientes"
        title="Nuevo cliente"
        actions={
          <ButtonLink href="/customers" variant="secondary">
            Volver a clientes
          </ButtonLink>
        }
      />
      <SectionCard>
        <CustomerForm companies={companies} priceLists={priceLists} />
      </SectionCard>
    </div>
  );
}
