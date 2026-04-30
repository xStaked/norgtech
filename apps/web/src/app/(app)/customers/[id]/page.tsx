import Link from "next/link";
import { notFound } from "next/navigation";
import { ButtonLink } from "@/components/ui/button-link";
import { DetailSection } from "@/components/ui/detail-section";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { crmTheme } from "@/components/ui/theme";
import { CustomerHistorySection } from "@/components/customers/customer-history-section";
import { CustomerRelatedRecords } from "@/components/customers/customer-related-records";
import { apiFetch } from "@/lib/api.server";

interface Contact {
  id: string;
  fullName: string;
  roleTitle: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  notes: string | null;
}

interface Segment {
  id: string;
  name: string;
}

interface Opportunity {
  id: string;
  title: string;
  stage: string;
  estimatedValue: string | number | null;
  expectedCloseDate: string | null;
  createdAt: string;
}

interface Visit {
  id: string;
  scheduledAt: string;
  status: string;
  summary: string | null;
}

interface FollowUpTask {
  id: string;
  title: string;
  type: string;
  status: string;
  dueAt: string;
}

interface QuoteItem {
  id: string;
  productSnapshotName: string;
  quantity: string | number;
  unitPrice: string | number;
  subtotal: string | number;
}

interface Quote {
  id: string;
  status: string;
  total: string | number;
  createdAt: string;
  items: QuoteItem[];
}

interface OrderItem {
  id: string;
  productSnapshotName: string;
  quantity: string | number;
  unitPrice: string | number;
  subtotal: string | number;
}

interface Order {
  id: string;
  status: string;
  total: string | number;
  createdAt: string;
  items: OrderItem[];
}

interface BillingRequest {
  id: string;
  status: string;
  sourceType: string;
  createdAt: string;
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
  segment: Segment | null;
  contacts: Contact[];
  opportunities: Opportunity[];
  visits: Visit[];
  followUpTasks: FollowUpTask[];
  quotes: Quote[];
  orders: Order[];
  billingRequests: BillingRequest[];
  createdAt: string;
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const response = await apiFetch(`/customers/${id}`);

  if (!response.ok) {
    notFound();
  }

  const customer: Customer = await response.json();

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <Link
        href="/customers"
        style={{
          fontSize: "0.875rem",
          color: crmTheme.colors.textMuted,
          textDecoration: "none",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        ← Volver a clientes
      </Link>

      <PageHeader
        eyebrow={customer.segment?.name ?? "Sin segmento"}
        title={customer.displayName}
        description={customer.legalName}
        actions={
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <ButtonLink
              href={`/visits/new?customerId=${customer.id}`}
              variant="secondary"
              size="sm"
            >
              + Visita
            </ButtonLink>
            <ButtonLink
              href={`/follow-ups/new?customerId=${customer.id}`}
              variant="secondary"
              size="sm"
            >
              + Seguimiento
            </ButtonLink>
            <ButtonLink
              href={`/quotes/new?customerId=${customer.id}`}
              variant="secondary"
              size="sm"
            >
              + Cotizacion
            </ButtonLink>
            <ButtonLink
              href={`/orders/new?customerId=${customer.id}`}
              variant="secondary"
              size="sm"
            >
              + Pedido
            </ButtonLink>
          </div>
        }
      />

      <CustomerRelatedRecords
        opportunitiesCount={customer.opportunities.length}
        visitsCount={customer.visits.length}
        followUpTasksCount={customer.followUpTasks.length}
        quotesCount={customer.quotes.length}
        ordersCount={customer.orders.length}
        billingRequestsCount={customer.billingRequests.length}
      />

      <DetailSection
        title="Informacion de contacto"
        fields={[
          { label: "NIT", value: customer.taxId ?? "—" },
          { label: "Telefono", value: customer.phone ?? "—" },
          { label: "Correo", value: customer.email ?? "—" },
          { label: "Direccion", value: customer.address ?? "—" },
          { label: "Ciudad", value: customer.city ?? "—" },
          { label: "Departamento", value: customer.department ?? "—" },
          { label: "Segmento", value: customer.segment?.name ?? "—" },
          {
            label: "Notas",
            value: customer.notes ?? "—",
          },
        ]}
      />

      {customer.contacts.length > 0 && (
        <SectionCard title="Contactos">
          <div style={{ display: "grid", gap: 12 }}>
            {customer.contacts.map((contact) => (
              <div
                key={contact.id}
                style={{
                  padding: "14px 16px",
                  borderRadius: crmTheme.radius.md,
                  border: `1px solid ${crmTheme.colors.border}`,
                  background: crmTheme.colors.surfaceMuted,
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 15, color: crmTheme.colors.text }}>
                  {contact.fullName}
                  {contact.isPrimary && (
                    <span
                      style={{
                        fontSize: "0.75rem",
                        backgroundColor: crmTheme.colors.primary,
                        color: "#ffffff",
                        padding: "0.125rem 0.5rem",
                        borderRadius: "0.25rem",
                        marginLeft: "0.5rem",
                        fontWeight: 500,
                      }}
                    >
                      Principal
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: "0.875rem",
                    color: crmTheme.colors.textMuted,
                    marginTop: 4,
                  }}
                >
                  {contact.roleTitle && `${contact.roleTitle}`}
                  {contact.roleTitle && (contact.phone || contact.email) ? " · " : ""}
                  {contact.phone && `${contact.phone}`}
                  {contact.phone && contact.email ? " · " : ""}
                  {contact.email}
                </div>
                {contact.notes && (
                  <div
                    style={{
                      fontSize: "0.8125rem",
                      color: crmTheme.colors.textSubtle,
                      marginTop: 6,
                      fontStyle: "italic",
                    }}
                  >
                    {contact.notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <CustomerHistorySection
        history={{
          opportunities: customer.opportunities,
          visits: customer.visits,
          followUpTasks: customer.followUpTasks,
          quotes: customer.quotes,
          orders: customer.orders,
          billingRequests: customer.billingRequests,
        }}
      />
    </div>
  );
}
