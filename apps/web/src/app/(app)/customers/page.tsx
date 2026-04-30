import Link from "next/link";
import { ButtonLink } from "@/components/ui/button-link";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { apiFetch } from "@/lib/api.server";

interface Contact {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
}

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
  city: string | null;
  department: string | null;
  segment: Segment | null;
  contacts: Contact[];
}

interface CustomerRow {
  id: string;
  displayName: string;
  legalName: string;
  segment: string | null;
  location: string;
  primaryContact: string | null;
  primaryContactMeta: string | null;
}

function buildLocation(customer: Customer) {
  if (customer.city && customer.department) {
    return `${customer.city}, ${customer.department}`;
  }

  return customer.city ?? customer.department ?? "Sin ubicación";
}

function getPrimaryContact(customer: Customer) {
  const contact = customer.contacts.find((item) => item.isPrimary) ?? customer.contacts[0];

  if (!contact) {
    return {
      name: null,
      meta: null,
    };
  }

  return {
    name: contact.fullName,
    meta: [contact.phone, contact.email].filter(Boolean).join(" · ") || null,
  };
}

const columns: readonly DataTableColumn<CustomerRow>[] = [
  {
    key: "customer",
    header: "Cliente",
    render: (row) => (
      <div style={{ display: "grid", gap: 4 }}>
        <Link href={`/customers/${row.id}`} style={{ fontWeight: 700, color: "#10233f", textDecoration: "none" }}>
          {row.displayName}
        </Link>
        <span style={{ fontSize: 13, color: "#52637a" }}>{row.legalName}</span>
      </div>
    ),
  },
  {
    key: "segment",
    header: "Segmento",
    render: (row) => row.segment ?? <span style={{ color: "#6b7c93" }}>Sin segmento</span>,
  },
  {
    key: "location",
    header: "Ubicación",
    render: (row) => row.location,
  },
  {
    key: "contact",
    header: "Contacto principal",
    render: (row) =>
      row.primaryContact ? (
        <div style={{ display: "grid", gap: 4 }}>
          <span>{row.primaryContact}</span>
          {row.primaryContactMeta ? (
            <span style={{ fontSize: 13, color: "#6b7c93" }}>{row.primaryContactMeta}</span>
          ) : null}
        </div>
      ) : (
        <span style={{ color: "#6b7c93" }}>Sin contacto principal</span>
      ),
  },
  {
    key: "detail",
    header: "Detalle",
    align: "right",
    render: (row) => (
      <Link href={`/customers/${row.id}`} style={{ color: "#2d6cdf", textDecoration: "none", fontWeight: 700 }}>
        Ver ficha
      </Link>
    ),
  },
] as const;

export default async function CustomersPage() {
  const response = await apiFetch("/customers");
  const customers: Customer[] = response.ok ? await response.json() : [];

  const rows: CustomerRow[] = customers.map((customer) => {
    const primary = getPrimaryContact(customer);

    return {
      id: customer.id,
      displayName: customer.displayName,
      legalName: customer.legalName,
      segment: customer.segment?.name ?? null,
      location: buildLocation(customer),
      primaryContact: primary.name,
      primaryContactMeta: primary.meta,
    };
  });

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <PageHeader
        eyebrow="Base comercial"
        title="Clientes"
        description="Vista operativa de cuentas activas, clasificación comercial y contacto principal."
        actions={<ButtonLink href="/customers/new">Nuevo cliente</ButtonLink>}
      />

      <FilterBar summary={`${rows.length.toLocaleString("es-CO")} clientes registrados`} />

      <SectionCard
        title="Cartera de clientes"
        description="Accede rápido a la ficha de cada cliente y valida cobertura comercial."
      >
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.id}
          emptyState={
            <EmptyState
              title="No hay clientes registrados"
              description="Crea el primer cliente para empezar a mover oportunidades, visitas y cotizaciones."
              action={<ButtonLink href="/customers/new">Crear cliente</ButtonLink>}
            />
          }
        />
      </SectionCard>
    </div>
  );
}
