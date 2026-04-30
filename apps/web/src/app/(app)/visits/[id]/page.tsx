import Link from "next/link";
import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api.server";
import { VisitActions } from "@/components/visits/visit-actions";

interface Customer {
  id: string;
  displayName: string;
}

interface Opportunity {
  id: string;
  title: string;
}

interface Visit {
  id: string;
  customer: Customer | null;
  opportunity: Opportunity | null;
  scheduledAt: string;
  summary: string;
  notes: string | null;
  nextStep: string | null;
  status: string;
  createdAt: string;
}

const statusLabels: Record<string, string> = {
  programada: "Programada",
  completada: "Completada",
  cancelada: "Cancelada",
  no_realizada: "No realizada",
};

const statusColors: Record<string, string> = {
  programada: "#f39c12",
  completada: "#27ae60",
  cancelada: "#c0392b",
  no_realizada: "#6b7c93",
};

export default async function VisitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const response = await apiFetch(`/visits/${id}`);

  if (!response.ok) {
    notFound();
  }

  const visit: Visit = await response.json();

  return (
    <div>
      <Link
        href="/visits"
        style={{
          fontSize: "0.875rem",
          color: "#52637a",
          textDecoration: "none",
          marginBottom: "1rem",
          display: "inline-block",
        }}
      >
        ← Volver a visitas
      </Link>

      <div
        style={{
          backgroundColor: "#ffffff",
          padding: "1.5rem",
          borderRadius: "0.75rem",
          boxShadow: "0 2px 8px rgba(16, 35, 63, 0.04)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
          <h1 style={{ margin: 0 }}>{visit.summary}</h1>
          <span
            style={{
              fontSize: "0.875rem",
              fontWeight: 600,
              padding: "0.375rem 0.75rem",
              borderRadius: "0.375rem",
              backgroundColor: statusColors[visit.status] || "#6b7c93",
              color: "#ffffff",
            }}
          >
            {statusLabels[visit.status] || visit.status}
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(14rem, 1fr))",
            gap: "1rem",
            marginTop: "1.5rem",
          }}
        >
          <Info label="Cliente" value={visit.customer?.displayName} />
          <Info label="Oportunidad" value={visit.opportunity?.title} />
          <Info
            label="Fecha programada"
            value={
              new Date(visit.scheduledAt).toLocaleString("es-CO", {
                dateStyle: "medium",
                timeStyle: "short",
              })
            }
          />
          <Info label="Siguiente paso" value={visit.nextStep} />
        </div>

        {visit.notes && (
          <div style={{ marginTop: "1.5rem" }}>
            <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#6b7c93" }}>Notas</div>
            <div style={{ marginTop: "0.25rem", color: "#10233f" }}>{visit.notes}</div>
          </div>
        )}

        {visit.status === "programada" && (
          <div style={{ marginTop: "1.5rem" }}>
            <VisitActions visitId={visit.id} />
          </div>
        )}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#6b7c93" }}>{label}</div>
      <div style={{ marginTop: "0.25rem", color: "#10233f" }}>{value}</div>
    </div>
  );
}
