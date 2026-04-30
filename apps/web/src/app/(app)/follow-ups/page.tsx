import Link from "next/link";
import { apiFetch } from "@/lib/api.server";

interface Customer {
  id: string;
  displayName: string;
}

interface FollowUpTask {
  id: string;
  customer: Customer | null;
  dueAt: string;
  title: string;
  type: string;
  status: string;
}

const statusLabels: Record<string, string> = {
  pendiente: "Pendiente",
  completada: "Completada",
  vencida: "Vencida",
};

const statusColors: Record<string, string> = {
  pendiente: "#f39c12",
  completada: "#27ae60",
  vencida: "#c0392b",
};

const typeLabels: Record<string, string> = {
  llamada: "Llamada",
  email: "Email",
  whatsapp: "WhatsApp",
  reunion: "Reunión",
  recordatorio: "Recordatorio",
  otro: "Otro",
};

export default async function FollowUpsPage() {
  const response = await apiFetch("/follow-up-tasks");
  const tasks: FollowUpTask[] = response.ok ? await response.json() : [];

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
        <h1 style={{ margin: 0 }}>Seguimientos</h1>
        <Link
          href="/follow-ups/new"
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
          Nueva tarea
        </Link>
      </div>

      {tasks.length === 0 ? (
        <p style={{ color: "#52637a" }}>No hay tareas de seguimiento registradas.</p>
      ) : (
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {tasks.map((task) => (
            <Link
              key={task.id}
              href={`/follow-ups/${task.id}`}
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
                  {task.title}
                </div>
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    padding: "0.25rem 0.5rem",
                    borderRadius: "0.25rem",
                    backgroundColor: statusColors[task.status] || "#6b7c93",
                    color: "#ffffff",
                    whiteSpace: "nowrap",
                  }}
                >
                  {statusLabels[task.status] || task.status}
                </span>
              </div>
              <div style={{ fontSize: "0.875rem", color: "#52637a", marginTop: "0.25rem" }}>
                {task.customer?.displayName || "Sin cliente"}
                {` · ${typeLabels[task.type] || task.type}`}
              </div>
              <div style={{ fontSize: "0.8125rem", color: "#6b7c93", marginTop: "0.25rem" }}>
                {new Date(task.dueAt).toLocaleString("es-CO", {
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
