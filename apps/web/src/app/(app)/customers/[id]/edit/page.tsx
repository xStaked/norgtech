import { notFound } from "next/navigation";
import { CustomerForm } from "@/components/customers/customer-form";
import { PageHeader } from "@/components/ui/page-header";
import { apiFetch } from "@/lib/api.server";
import type { PriceListRef } from "@/lib/catalog";

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
  country: string | null;
  priceListId: string | null;
  notes: string | null;
  segmentId: string | null;
  companyId: string | null;
  assignedToUserId: string | null;
  customerType: string | null;
  creditLimit: string | null;
  paymentCondition: string | null;
  paymentDays: number | null;
  purchaseBudget: string | number | null;
}

export default async function CustomerEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [customerResponse, segmentsResponse, companiesResponse, priceListsResponse] =
    await Promise.all([
      apiFetch(`/customers/${id}`),
      apiFetch("/customer-segments"),
      apiFetch("/companies"),
      apiFetch("/price-lists"),
    ]);

  if (!customerResponse.ok) {
    notFound();
  }

  const customer: Customer = await customerResponse.json();
  const segments: Segment[] = segmentsResponse.ok
    ? await segmentsResponse.json()
    : [];
  const companies = companiesResponse.ok ? await companiesResponse.json() : [];
  const priceLists: PriceListRef[] = priceListsResponse.ok
    ? await priceListsResponse.json()
    : [];

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <PageHeader
        eyebrow="Clientes"
        title="Editar cliente"
        description={customer.displayName}
      />

      <CustomerForm
        segments={segments}
        companies={companies}
        priceLists={priceLists}
        customer={customer}
      />
    </div>
  );
}
