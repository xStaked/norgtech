import Link from "next/link";
import { apiFetch } from "@/lib/api.server";

interface Customer {
  id: string;
  displayName: string;
}

interface Visit {
  id: string;
  customer: Customer | null;
  scheduledAt: string;
  summary: string;
  status: string;
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

export default async function VisitsPage() {
  const response = await apiFetch("/visits");
  const visits: Visit[] = response.ok ? await response.json() : [];

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
        }}
      >
        <h1 style={{ margin: 0 }}>Visitas</h1>
        <Link
          href="/visits/new"
          style={{
            padding: "0.5rem 1rem",
            borderRadius: "0.5rem",
            backgroundColor: "#10233f",
            color: "#ffffff",
            textDecoration: "none",
            fontWeight: 600,
            fontSize: "0.875rem",
          }}
        >
          Nueva visita
        </Link>
      </div>

      {visits.length === 0 ? (
        <p style={{ color: "#52637a" }}>No hay visitas registradas.</p>
      ) : (
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {visits.map((visit) => (
            <Link
              key={visit.id}
              href={`/visits/${visit.id}`}
              style={{
                display: "block",
                backgroundColor: "#ffffff",
                padding: "1rem 1.25rem",
                borderRadius: "0.75rem",
                boxShadow: "0 2px 8px rgba(16, 35, 63, 0.04)",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ fontWeight: 600, color: "#10233f" }}>
                  {visit.customer?.displayName || "Sin cliente"}
                </div>
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    padding: "0.25rem 0.5rem",
                    borderRadius: "0.25rem",
                    backgroundColor: statusColors[visit.status] || "#6b7c93",
                    color: "#ffffff",
                    whiteSpace: "nowrap",
                  }}
                >
                  {statusLabels[visit.status] || visit.status}
                </span>
              </div>
              <div style={{ fontSize: "0.875rem", color: "#52637a", marginTop: "0.25rem" }}>
                {visit.summary}
              </div>
              <div style={{ fontSize: "0.8125rem", color: "#6b7c93", marginTop: "0.25rem" }}>
                {new Date(visit.scheduledAt).toLocaleString("es-CO", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
