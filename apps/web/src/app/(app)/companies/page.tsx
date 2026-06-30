import Link from "next/link";
import { ButtonLink } from "@/components/ui/button-link";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiFetch } from "@/lib/api.server";

interface Company {
  id: string;
  name: string;
  legalName: string;
  nit: string;
  prefix: string;
  isActive: boolean;
}

interface CompanyRow {
  id: string;
  name: string;
  legalName: string;
  nit: string;
  prefix: string;
  isActive: boolean;
}

const columns: readonly DataTableColumn<CompanyRow>[] = [
  {
    key: "name",
    header: "Nombre",
    render: (row) => (
      <div style={{ display: "grid", gap: 4 }}>
        <Link href={`/companies/${row.id}`} style={{ fontWeight: 700, color: "#0c2c44", textDecoration: "none" }}>
          {row.name}
        </Link>
        <span style={{ fontSize: 13, color: "#44556e" }}>{row.legalName}</span>
      </div>
    ),
  },
  {
    key: "prefix",
    header: "Prefijo",
    render: (row) => (
      <code style={{ padding: "2px 6px", borderRadius: 4, backgroundColor: "#f0f4f8", fontSize: 13 }}>
        {row.prefix}
      </code>
    ),
  },
  {
    key: "nit",
    header: "NIT",
    render: (row) => row.nit,
  },
  {
    key: "status",
    header: "Estado",
    render: (row) => (
      <StatusBadge tone={row.isActive ? "success" : "neutral"}>
        {row.isActive ? "Activa" : "Inactiva"}
      </StatusBadge>
    ),
  },
] as const;

export default async function CompaniesPage() {
  const response = await apiFetch("/companies");
  const companies: Company[] = response.ok ? await response.json() : [];

  const rows: CompanyRow[] = companies;

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <PageHeader
        eyebrow="Admin"
        title="Empresas"
        description="Empresas facturadoras activas en el sistema."
        actions={<ButtonLink href="/companies/new">Nueva empresa</ButtonLink>}
      />

      <FilterBar summary={`${rows.length.toLocaleString("es-CO")} empresas registradas`} />

      <SectionCard title="Catalogo de empresas" description="Gestiona las empresas facturadoras disponibles en pedidos y facturas.">
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.id}
          emptyState={
            <EmptyState
              title="No hay empresas registradas"
              description="Registra la primera empresa para habilitar pedidos y facturacion."
              action={<ButtonLink href="/companies/new">Crear empresa</ButtonLink>}
            />
          }
        />
      </SectionCard>
    </div>
  );
}
