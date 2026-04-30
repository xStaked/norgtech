import Link from "next/link";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button-link";

interface ReportListItem {
  id: string;
  title: string;
  customerName: string | null;
  customerId: string | null;
  createdAt: string;
  creatorName: string | null;
}

interface ReportListProps {
  reports: ReportListItem[];
}

const dateFormatter = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const columns: readonly DataTableColumn<ReportListItem>[] = [
  {
    key: "title",
    header: "Reporte",
    render: (row) => (
      <div style={{ display: "grid", gap: 4 }}>
        <span style={{ fontWeight: 700, color: "#10233f" }}>{row.title}</span>
        <span style={{ fontSize: 13, color: "#52637a" }}>ID #{row.id.slice(-6)}</span>
      </div>
    ),
  },
  {
    key: "customer",
    header: "Cliente",
    render: (row) =>
      row.customerId ? (
        <Link
          href={`/customers/${row.customerId}`}
          style={{ color: "#2d6cdf", fontWeight: 700, textDecoration: "none" }}
        >
          {row.customerName}
        </Link>
      ) : (
        <span style={{ color: "#52637a" }}>Sin cliente</span>
      ),
  },
  {
    key: "creator",
    header: "Generado por",
    render: (row) => <span style={{ color: "#52637a" }}>{row.creatorName ?? "—"}</span>,
  },
  {
    key: "createdAt",
    header: "Fecha",
    render: (row) => <span style={{ color: "#52637a" }}>{dateFormatter.format(new Date(row.createdAt))}</span>,
  },
  {
    key: "detail",
    header: "Detalle",
    align: "right",
    render: (row) => (
      <Link href={`/reports/${row.id}`} style={{ color: "#2d6cdf", fontWeight: 700, textDecoration: "none" }}>
        Abrir
      </Link>
    ),
  },
] as const;

export function ReportList({ reports }: ReportListProps) {
  return (
    <DataTable
      columns={columns}
      rows={reports}
      getRowKey={(row) => row.id}
      emptyState={
        <EmptyState
          title="No hay reportes ejecutivos"
          description="Genera reportes desde visitas completadas para construir el historial ejecutivo de tus clientes."
          action={<ButtonLink href="/visits">Ir a visitas</ButtonLink>}
        />
      }
      caption={`${reports.length.toLocaleString("es-CO")} reporte(s) registrado(s).`}
    />
  );
}
