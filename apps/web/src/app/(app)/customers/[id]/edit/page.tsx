import { notFound } from "next/navigation";
import { CustomerForm } from "@/components/customers/customer-form";
import { PageHeader } from "@/components/ui/page-header";
import { apiFetch } from "@/lib/api.server";
import { getCurrentUser } from "@/lib/auth.server";
import { canAssignCustomers } from "@/lib/auth";
import type { PriceListRef } from "@/lib/catalog";

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

  const [user, customerResponse, companiesResponse, priceListsResponse] = await Promise.all([
    getCurrentUser(),
    apiFetch(`/customers/${id}`),
    apiFetch("/companies"),
    apiFetch("/price-lists"),
  ]);

  if (!customerResponse.ok) {
    notFound();
  }

  const customer: Customer = await customerResponse.json();
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
        companies={companies}
        priceLists={priceLists}
        customer={customer}
        canAssign={canAssignCustomers(user?.role ?? null)}
      />
    </div>
  );
}
