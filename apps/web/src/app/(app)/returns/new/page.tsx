import { ButtonLink } from "@/components/ui/button-link";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { apiFetch } from "@/lib/api.server";
import { ReturnForm, type ReturnFormCustomer, type ReturnFormInvoice } from "@/components/returns/return-form";

interface CustomerResponse {
  id: string;
  displayName: string;
}

interface InvoiceResponse {
  id: string;
  invoiceNumber: string;
  customer: { id: string };
  totalAmount: string;
  totalPaid: string;
  creditNoteTotal?: string;
  status: string;
}

export default async function NewReturnPage() {
  const [customersRes, invoicesRes] = await Promise.all([
    apiFetch("/customers"),
    apiFetch("/invoices"),
  ]);

  const customersRaw: CustomerResponse[] = customersRes.ok ? await customersRes.json() : [];
  const invoicesRaw: InvoiceResponse[] = invoicesRes.ok ? await invoicesRes.json() : [];

  const customers: ReturnFormCustomer[] = customersRaw.map((c) => ({
    id: c.id,
    displayName: c.displayName,
  }));

  // Only invoices with outstanding balance can absorb a credit note.
  const invoices: ReturnFormInvoice[] = invoicesRaw
    .filter((i) => i.status !== "anulada")
    .map((i) => ({
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      customerId: i.customer.id,
      outstanding:
        Number(i.totalAmount) - Number(i.totalPaid) - Number(i.creditNoteTotal ?? 0),
    }))
    .filter((i) => i.outstanding > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Devoluciones"
        title="Nueva devolucion"
        description="Registra una devolucion; al asociar una factura se genera la nota credito que reduce la cartera."
        actions={
          <ButtonLink href="/returns" variant="secondary">
            Volver a devoluciones
          </ButtonLink>
        }
      />
      <SectionCard>
        <ReturnForm customers={customers} invoices={invoices} />
      </SectionCard>
    </div>
  );
}
