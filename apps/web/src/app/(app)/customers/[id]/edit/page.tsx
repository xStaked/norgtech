import { notFound } from "next/navigation";
import { CustomerForm } from "@/components/customers/customer-form";
import { PageHeader } from "@/components/ui/page-header";
import { apiFetch } from "@/lib/api.server";

interface Segment {
  id: string;
  name: string;
}

interface Customer {
  id: string;
  legalName: string;
  displayName: string;
  taxId: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  department: string | null;
  notes: string | null;
  segmentId: string | null;
  assignedToUserId: string | null;
  customerType: string | null;
  creditLimit: string | null;
  paymentCondition: string | null;
  paymentDays: number | null;
}

export default async function CustomerEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [customerResponse, segmentsResponse] = await Promise.all([
    apiFetch(`/customers/${id}`),
    apiFetch("/customer-segments"),
  ]);

  if (!customerResponse.ok) {
    notFound();
  }

  const customer: Customer = await customerResponse.json();
  const segments: Segment[] = segmentsResponse.ok
    ? await segmentsResponse.json()
    : [];

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <PageHeader
        eyebrow="Clientes"
        title="Editar cliente"
        description={customer.displayName}
      />

      <CustomerForm segments={segments} customer={customer} />
    </div>
  );
}
