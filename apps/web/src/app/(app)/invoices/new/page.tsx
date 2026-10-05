import { ButtonLink } from "@/components/ui/button-link";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { InvoiceForm } from "@/components/invoices/invoice-form";
import { apiFetch } from "@/lib/api.server";

export default async function NewInvoicePage() {
  const [customersResponse, ordersResponse] = await Promise.all([
    apiFetch("/customers"),
    apiFetch("/orders"),
  ]);

  const customers = (customersResponse.ok ? await customersResponse.json() : []) as Array<{
    id: string;
    displayName: string;
  }>;
  const orders = (ordersResponse.ok ? await ordersResponse.json() : []) as Array<{
    id: string;
    customerId?: string | null;
    customer?: { id: string } | null;
    orderNumber?: string | null;
    total?: string | number | null;
  }>;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Cartera"
        title="Nueva factura"
        description="Crear una factura para un cliente."
        actions={
          <ButtonLink href="/invoices" variant="secondary">
            Volver a cartera
          </ButtonLink>
        }
      />
      <SectionCard>
        <InvoiceForm customers={customers} orders={orders} />
      </SectionCard>
    </div>
  );
}
