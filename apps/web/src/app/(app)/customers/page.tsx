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
import { ListFilters } from "@/components/ui/list-filters";
import { buildQueryString } from "@/lib/query-string";
import { CUSTOMER_TYPE_LABELS, PAYMENT_LABELS, customerTypeLabel, paymentLabel } from "@/lib/labels";

interface Contact {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
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
  customerType: string | null;
  contacts: Contact[];
  paymentCondition: string | null;
  company: { id: string; name: string } | null;
  assignedToUser: { id: string; name: string } | null;
}

interface CustomerRow {
  id: string;
  displayName: string;
  legalName: string;
  customerType: string | null;
  location: string;
  primaryContact: string | null;
  primaryContactMeta: string | null;
  creditLimit: string | null;
  active: boolean;
  paymentCondition: string | null;
  company: { id: string; name: string } | null;
  seller: string | null;
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
    key: "customerType",
    header: "Tipo",
    render: (row) => customerTypeLabel(row.customerType),
  },
  {
    key: "seller",
    header: "Vendedor",
    render: (row) => row.seller ?? <span style={{ color: "#6b7787" }}>Sin asignar</span>,
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
    customerType: single("customerType") || undefined,
    assignedToUserId: single("assignedToUserId") || undefined,
    paymentCondition: single("paymentCondition") || undefined,
    active: single("active") || undefined,
  };
  if (apiParams.active === undefined) {
    apiParams.includeInactive = "true";
  }
  const queryString = buildQueryString(apiParams);

  const hasFilters = Object.entries(apiParams).some(
    ([key, value]) => key !== "includeInactive" && value !== undefined,
  );

  const [response, companiesResponse, sellersResponse, totalResponse] = await Promise.all([
    apiFetch(`/customers?${queryString}`),
    apiFetch("/companies"),
    apiFetch("/users/sellers"),
    // "N de M": el total sin filtrar solo se necesita (y se consulta) cuando hay
    // filtros activos, y va en paralelo con el listado filtrado. ponytail:
    // segunda consulta completa; endpoint de conteo cuando la tabla crezca.
    hasFilters ? apiFetch("/customers?includeInactive=true") : null,
  ]);

  const customers: Customer[] = response.ok ? await response.json() : [];
  const companies: { id: string; name: string }[] = companiesResponse.ok
    ? await companiesResponse.json()
    : [];
  const sellers: { id: string; name: string }[] = sellersResponse.ok
    ? await sellersResponse.json()
    : [];

  let total = customers.length;
  if (totalResponse?.ok) {
    const all: unknown[] = await totalResponse.json();
    total = all.length;
  }

  const rows: CustomerRow[] = customers.map((customer) => {
    const primary = getPrimaryContact(customer);

    return {
      id: customer.id,
      displayName: customer.displayName,
      legalName: customer.legalName,
      customerType: customer.customerType,
      location: buildLocation(customer),
      primaryContact: primary.name,
      primaryContactMeta: primary.meta,
      creditLimit: customer.creditLimit != null
        ? `$${Number(customer.creditLimit).toLocaleString("es-CO", { maximumFractionDigits: 0 })}`
        : null,
      active: customer.active,
      paymentCondition: customer.paymentCondition,
      company: customer.company,
      seller: customer.assignedToUser?.name ?? null,
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

      <ListFilters
        searchPlaceholder="Buscar por nombre, razón social o NIT"
        selects={[
          {
            key: "companyId",
            allLabel: "Todas las empresas",
            options: companies.map((company) => ({ value: company.id, label: company.name })),
          },
          {
            key: "active",
            allLabel: "Todos los estados",
            options: [
              { value: "true", label: "Activos" },
              { value: "false", label: "Inactivos" },
            ],
          },
          {
            key: "assignedToUserId",
            allLabel: "Todos los vendedores",
            options: sellers.map((seller) => ({ value: seller.id, label: seller.name })),
          },
          {
            key: "customerType",
            allLabel: "Todos los tipos",
            options: Object.entries(CUSTOMER_TYPE_LABELS).map(([value, label]) => ({ value, label })),
          },
          {
            key: "paymentCondition",
            allLabel: "Todas las formas de pago",
            options: Object.entries(PAYMENT_LABELS).map(([value, label]) => ({ value, label })),
          },
        ]}
        shown={rows.length}
        total={total}
        noun="clientes"
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
