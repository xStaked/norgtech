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

interface FollowUpTask {
  id: string;
  customer: Customer | null;
  dueAt: string;
  title: string;
  type: string;
  status: string;
}

const visitStatusColors: Record<string, string> = {
  programada: "#f39c12",
  completada: "#27ae60",
  cancelada: "#c0392b",
  no_realizada: "#6b7c93",
};

const taskStatusColors: Record<string, string> = {
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

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default async function AgendaPage() {
  const [visitsRes, tasksRes] = await Promise.all([
    apiFetch("/visits"),
    apiFetch("/follow-up-tasks"),
  ]);

  const visits: Visit[] = visitsRes.ok ? await visitsRes.json() : [];
  const tasks: FollowUpTask[] = tasksRes.ok ? await tasksRes.json() : [];

  const today = new Date();
  const weekStart = startOfWeek(today);
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    days.push(addDays(weekStart, i));
  }

  const weekDays = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  return (
    <div>
      <h1 style={{ margin: 0, marginBottom: "1.5rem" }}>Agenda semanal</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: "0.75rem",
        }}
      >
        {days.map((day, index) => {
          const dayVisits = visits.filter((v) =>
            isSameDay(new Date(v.scheduledAt), day)
          );
          const dayTasks = tasks.filter((t) =>
            isSameDay(new Date(t.dueAt), day)
          );
          const isToday = isSameDay(day, today);

          return (
            <div
              key={index}
              style={{
                backgroundColor: "#ffffff",
                borderRadius: "0.75rem",
                boxShadow: "0 2px 8px rgba(16, 35, 63, 0.04)",
                padding: "0.75rem",
                minHeight: "12rem",
              }}
            >
              <div
                style={{
                  textAlign: "center",
                  paddingBottom: "0.5rem",
                  borderBottom: isToday ? "2px solid #10233f" : "1px solid #e2e8f0",
                  marginBottom: "0.5rem",
                }}
              >
                <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#52637a" }}>
                  {weekDays[index]}
                </div>
                <div
                  style={{
                    fontSize: "1.125rem",
                    fontWeight: 700,
                    color: isToday ? "#10233f" : "#10233f",
                  }}
                >
                  {day.getDate()}
                </div>
              </div>

              <div style={{ display: "grid", gap: "0.5rem" }}>
                {dayVisits.map((visit) => (
                  <Link
                    key={`v-${visit.id}`}
                    href={`/visits/${visit.id}`}
                    style={{
                      display: "block",
                      textDecoration: "none",
                      color: "inherit",
                      padding: "0.5rem",
                      borderRadius: "0.5rem",
                      backgroundColor: "#f0f4f8",
                      borderLeft: `3px solid ${visitStatusColors[visit.status] || "#6b7c93"}`,
                    }}
                  >
                    <div style={{ fontSize: "0.6875rem", fontWeight: 600, color: "#52637a" }}>
                      VISITA
                    </div>
                    <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#10233f", marginTop: "0.125rem" }}>
                      {visit.summary}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "#6b7c93", marginTop: "0.125rem" }}>
                      {visit.customer?.displayName || "Sin cliente"}
                    </div>
                  </Link>
                ))}

                {dayTasks.map((task) => (
                  <Link
                    key={`t-${task.id}`}
                    href={`/follow-ups/${task.id}`}
                    style={{
                      display: "block",
                      textDecoration: "none",
                      color: "inherit",
                      padding: "0.5rem",
                      borderRadius: "0.5rem",
                      backgroundColor: "#f8fafc",
                      borderLeft: `3px solid ${taskStatusColors[task.status] || "#6b7c93"}`,
                    }}
                  >
                    <div style={{ fontSize: "0.6875rem", fontWeight: 600, color: "#52637a" }}>
                      {typeLabels[task.type] || task.type}
                    </div>
                    <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#10233f", marginTop: "0.125rem" }}>
                      {task.title}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "#6b7c93", marginTop: "0.125rem" }}>
                      {task.customer?.displayName || "Sin cliente"}
                    </div>
                  </Link>
                ))}

                {dayVisits.length === 0 && dayTasks.length === 0 && (
                  <div style={{ fontSize: "0.75rem", color: "#c8d3e0", textAlign: "center", padding: "1rem 0" }}>
                    Sin actividades
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
