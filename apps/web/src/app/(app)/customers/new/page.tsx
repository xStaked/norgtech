import { ButtonLink } from "@/components/ui/button-link";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { apiFetch } from "@/lib/api.server";
import { CustomerForm } from "@/components/customers/customer-form";

interface Segment {
  id: string;
  name: string;
}

export default async function NewCustomerPage() {
  const response = await apiFetch("/customer-segments");
  const segments: Segment[] = response.ok ? await response.json() : [];

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
        <CustomerForm segments={segments} />
      </SectionCard>
    </div>
  );
}
