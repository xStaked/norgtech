import Link from "next/link";
import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api.server";
import { FollowUpActions } from "@/components/follow-ups/follow-up-actions";

interface Customer {
  id: string;
  displayName: string;
}

interface Opportunity {
  id: string;
  title: string;
}

interface FollowUpTask {
  id: string;
  customer: Customer | null;
  opportunity: Opportunity | null;
  type: string;
  title: string;
  dueAt: string;
  notes: string | null;
  status: string;
  createdAt: string;
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

export default async function FollowUpDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const response = await apiFetch(`/follow-up-tasks/${id}`);

  if (!response.ok) {
    notFound();
  }

  const task: FollowUpTask = await response.json();

  return (
    <div>
      <Link
        href="/follow-ups"
        style={{
          fontSize: "0.875rem",
          color: "#52637a",
          textDecoration: "none",
          marginBottom: "1rem",
          display: "inline-block",
        }}
      >
        ← Volver a seguimientos
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
          <h1 style={{ margin: 0 }}>{task.title}</h1>
          <span
            style={{
              fontSize: "0.875rem",
              fontWeight: 600,
              padding: "0.375rem 0.75rem",
              borderRadius: "0.375rem",
              backgroundColor: statusColors[task.status] || "#6b7c93",
              color: "#ffffff",
            }}
          >
            {statusLabels[task.status] || task.status}
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
          <Info label="Cliente" value={task.customer?.displayName} />
          <Info label="Oportunidad" value={task.opportunity?.title} />
          <Info label="Tipo" value={typeLabels[task.type] || task.type} />
          <Info
            label="Fecha de vencimiento"
            value={
              new Date(task.dueAt).toLocaleString("es-CO", {
                dateStyle: "medium",
                timeStyle: "short",
              })
            }
          />
        </div>

        {task.notes && (
          <div style={{ marginTop: "1.5rem" }}>
            <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#6b7c93" }}>Notas</div>
            <div style={{ marginTop: "0.25rem", color: "#10233f" }}>{task.notes}</div>
          </div>
        )}

        {task.status !== "completada" && (
          <div style={{ marginTop: "1.5rem" }}>
            <FollowUpActions taskId={task.id} />
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
