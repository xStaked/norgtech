import Link from "next/link";
import { ButtonLink } from "@/components/ui/button-link";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiFetch } from "@/lib/api.server";
import { getCurrentUser } from "@/lib/auth.server";
import { canCreate } from "@/lib/auth";
import { CustomersFilters } from "@/components/customers/customers-filters";
import { buildQueryString } from "@/lib/query-string";
import { paymentLabel } from "@/lib/labels";

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
  creditLimit: string | number | null;
  active: boolean;
  segment: Segment | null;
  contacts: Contact[];
  paymentCondition: string | null;
  company: { id: string; name: string } | null;
}

interface CustomerRow {
  id: string;
  displayName: string;
  legalName: string;
  segment: string | null;
  location: string;
  primaryContact: string | null;
  primaryContactMeta: string | null;
  creditLimit: string | null;
  active: boolean;
  paymentCondition: string | null;
  company: { id: string; name: string } | null;
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
        <Link href={`/customers/${row.id}`} style={{ fontWeight: 700, color: "#0c2c44", textDecoration: "none" }}>
          {row.displayName}
        </Link>
        <span style={{ fontSize: 13, color: "#44556e" }}>{row.legalName}</span>
        <span style={{ fontSize: 12, color: "#6b7787" }}>{row.company?.name}</span>
      </div>
    ),
  },
  {
    key: "segment",
    header: "Segmento",
    render: (row) => row.segment ?? <span style={{ color: "#6b7787" }}>Sin segmento</span>,
  },
  {
    key: "location",
    header: "Ubicación",
    render: (row) => row.location,
  },
  {
    key: "status",
    header: "Estado",
    render: (row) => (
      <StatusBadge tone={row.active ? "success" : "neutral"}>
        {row.active ? "Activo" : "Inactivo"}
      </StatusBadge>
    ),
  },
  {
    key: "payment",
    header: "Pago",
    render: (row) => (
      <div style={{ display: "grid", gap: 2 }}>
        <span>{paymentLabel(row.paymentCondition)}</span>
        {row.creditLimit && (
          <span style={{ fontSize: 12, color: "#6b7787" }}>Cupo {row.creditLimit}</span>
        )}
      </div>
    ),
  },
  {
    key: "contact",
    header: "Contacto principal",
    render: (row) =>
      row.primaryContact ? (
        <div style={{ display: "grid", gap: 4 }}>
          <span>{row.primaryContact}</span>
          {row.primaryContactMeta ? (
            <span style={{ fontSize: 13, color: "#6b7787" }}>{row.primaryContactMeta}</span>
          ) : null}
        </div>
      ) : (
        <span style={{ color: "#6b7787" }}>Sin contacto principal</span>
      ),
  },
  {
    key: "detail",
    header: "Detalle",
    align: "right",
    render: (row) => (
      <Link href={`/customers/${row.id}`} style={{ color: "#0f5c8a", textDecoration: "none", fontWeight: 700 }}>
        Ver ficha
      </Link>
    ),
  },
] as const;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const userRole = user?.role ?? null;

  // Sin filtro de estado explicito la lista muestra Todos (activos+inactivos),
  // igual que antes de los filtros.
  const single = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const apiParams: Record<string, string | undefined> = {
    search: single("search") || undefined,
    companyId: single("companyId") || undefined,
    segmentId: single("segmentId") || undefined,
    paymentCondition: single("paymentCondition") || undefined,
    active: single("active") || undefined,
  };
  if (apiParams.active === undefined) {
    apiParams.includeInactive = "true";
  }
  const queryString = buildQueryString(apiParams);

  const [response, companiesResponse, segmentsResponse] = await Promise.all([
    apiFetch(`/customers?${queryString}`),
    apiFetch("/companies"),
    apiFetch("/customer-segments"),
  ]);

  const customers: Customer[] = response.ok ? await response.json() : [];
  const companies: { id: string; name: string }[] = companiesResponse.ok
    ? await companiesResponse.json()
    : [];
  const segments: { id: string; name: string }[] = segmentsResponse.ok
    ? await segmentsResponse.json()
    : [];

  const hasFilters = Object.entries(apiParams).some(
    ([key, value]) => key !== "includeInactive" && value !== undefined,
  );
  // "N de M": el total sin filtrar solo se necesita (y se consulta) cuando hay
  // filtros activos. ponytail: segunda consulta completa; endpoint de conteo
  // cuando la tabla crezca.
  let total = customers.length;
  if (hasFilters) {
    const totalResponse = await apiFetch("/customers?includeInactive=true");
    const all: unknown[] = totalResponse.ok ? await totalResponse.json() : [];
    total = all.length;
  }

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
      creditLimit: customer.creditLimit != null
        ? `$${Number(customer.creditLimit).toLocaleString("es-CO", { maximumFractionDigits: 0 })}`
        : null,
      active: customer.active,
      paymentCondition: customer.paymentCondition,
      company: customer.company,
    };
  });

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <PageHeader
        eyebrow="Base comercial"
        title="Clientes"
        description="Vista operativa de cuentas activas, clasificación comercial y contacto principal."
        actions={canCreate(userRole, "customer") && <ButtonLink href="/customers/new">Nuevo cliente</ButtonLink>}
      />

      <CustomersFilters
        companies={companies}
        segments={segments}
        shown={rows.length}
        total={total}
      />

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
              action={canCreate(userRole, "customer") && <ButtonLink href="/customers/new">Crear cliente</ButtonLink>}
            />
          }
        />
      </SectionCard>
    </div>
  );
}
