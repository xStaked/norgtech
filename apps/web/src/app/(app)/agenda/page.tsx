import Link from "next/link";
import { AgendaFilters } from "@/components/agenda/agenda-filters";
import { AgendaQueue } from "@/components/agenda/agenda-queue";
import type { AgendaView } from "@/components/agenda/agenda-filters";
import { ButtonLink } from "@/components/ui/button-link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { crmTheme, type CrmStatusTone } from "@/components/ui/theme";
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

interface AgendaItem {
  id: string;
  kind: "visit" | "task";
  title: string;
  customer: Customer | null;
  scheduledAt: string;
  status: string;
  type?: string;
}

const visitStatusTone: Record<string, CrmStatusTone> = {
  programada: "warning",
  completada: "success",
  cancelada: "danger",
  no_realizada: "neutral",
};

const taskStatusTone: Record<string, CrmStatusTone> = {
  pendiente: "warning",
  completada: "success",
  vencida: "danger",
};

const visitStatusLabels: Record<string, string> = {
  programada: "Programada",
  completada: "Completada",
  cancelada: "Cancelada",
  no_realizada: "No realizada",
};

const taskStatusLabels: Record<string, string> = {
  pendiente: "Pendiente",
  completada: "Completada",
  vencida: "Vencida",
};

function toAgendaItems(visits: Visit[], tasks: FollowUpTask[]): AgendaItem[] {
  const visitItems = visits.map<AgendaItem>((visit) => ({
    id: visit.id,
    kind: "visit",
    title: visit.summary || "Visita programada",
    customer: visit.customer,
    scheduledAt: visit.scheduledAt,
    status: visit.status,
  }));

  const taskItems = tasks.map<AgendaItem>((task) => ({
    id: task.id,
    kind: "task",
    title: task.title,
    customer: task.customer,
    scheduledAt: task.dueAt,
    status: task.status,
    type: task.type,
  }));

  return [...visitItems, ...taskItems].sort(
    (left, right) =>
      new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime(),
  );
}

function isOverdueTask(task: FollowUpTask): boolean {
  return task.status === "pendiente" && new Date(task.dueAt).getTime() < Date.now();
}

function isDueToday(task: FollowUpTask): boolean {
  const now = new Date();
  const due = new Date(task.dueAt);
  return (
    due.getFullYear() === now.getFullYear() &&
    due.getMonth() === now.getMonth() &&
    due.getDate() === now.getDate()
  );
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const view = (typeof params.view === "string" ? params.view : "hoy") as AgendaView;

  // Auto-mark overdue tasks on every agenda load
  try {
    await apiFetch("/follow-up-tasks/mark-overdue", { method: "POST" });
  } catch {
    // Silently ignore if the user lacks permission
  }

  let visits: Visit[] = [];
  let tasks: FollowUpTask[] = [];

  if (view === "hoy") {
    const [visitsRes, tasksDueTodayRes, tasksOverdueRes] = await Promise.all([
      apiFetch("/visits?today=true"),
      apiFetch("/follow-up-tasks?dueToday=true"),
      apiFetch("/follow-up-tasks?overdue=true"),
    ]);
    visits = visitsRes.ok ? await visitsRes.json() : [];
    const dueToday = tasksDueTodayRes.ok ? await tasksDueTodayRes.json() : [];
    const overdue = tasksOverdueRes.ok ? await tasksOverdueRes.json() : [];
    const taskIds = new Set(dueToday.map((t: FollowUpTask) => t.id));
    tasks = [...dueToday, ...overdue.filter((t: FollowUpTask) => !taskIds.has(t.id))];
  } else if (view === "semana") {
    const [visitsRes, tasksRes] = await Promise.all([
      apiFetch("/visits?thisWeek=true"),
      apiFetch("/follow-up-tasks?thisWeek=true"),
    ]);
    visits = visitsRes.ok ? await visitsRes.json() : [];
    tasks = tasksRes.ok ? await tasksRes.json() : [];
  } else if (view === "vencidos") {
    const [visitsRes, tasksRes] = await Promise.all([
      apiFetch("/visits?status=no_realizada"),
      apiFetch("/follow-up-tasks?overdue=true"),
    ]);
    visits = visitsRes.ok ? await visitsRes.json() : [];
    tasks = tasksRes.ok ? await tasksRes.json() : [];
  }

  const items = toAgendaItems(visits, tasks);

  const allVisitsRes = await apiFetch("/visits");
  const allTasksRes = await apiFetch("/follow-up-tasks");
  const allVisits: Visit[] = allVisitsRes.ok ? await allVisitsRes.json() : [];
  const allTasks: FollowUpTask[] = allTasksRes.ok ? await allTasksRes.json() : [];

  const todayVisits = allVisits.filter((v) => {
    const d = new Date(v.scheduledAt);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  });

  const overdueTasks = allTasks.filter((t) => t.status === "vencida" || isOverdueTask(t));
  const dueTodayTasks = allTasks.filter((t) => isDueToday(t));

  const counts: Record<AgendaView, number> = {
    hoy: todayVisits.length + dueTodayTasks.length + overdueTasks.filter((t) => isDueToday(t) || isOverdueTask(t)).length,
    semana: allVisits.filter((v) => {
      const d = new Date(v.scheduledAt);
      const now = new Date();
      const day = now.getDay();
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const start = new Date(now);
      start.setDate(now.getDate() + diffToMonday);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return d.getTime() >= start.getTime() && d.getTime() <= end.getTime();
    }).length + allTasks.filter((t) => {
      const d = new Date(t.dueAt);
      const now = new Date();
      const day = now.getDay();
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const start = new Date(now);
      start.setDate(now.getDate() + diffToMonday);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return d.getTime() >= start.getTime() && d.getTime() <= end.getTime();
    }).length,
    vencidos: overdueTasks.length + allVisits.filter((v) => v.status === "no_realizada").length,
  };

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <PageHeader
        eyebrow="Operacion diaria"
        title="Agenda operativa"
        description="Semana comercial consolidada con visitas, seguimientos y foco inmediato del equipo."
        actions={
          <>
            <ButtonLink href="/visits/new">Nueva visita</ButtonLink>
            <ButtonLink href="/follow-ups/new" variant="secondary">
              Nuevo seguimiento
            </ButtonLink>
          </>
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
        }}
      >
        <StatCard
          label="Compromisos de hoy"
          value={counts.hoy.toLocaleString("es-CO")}
          tone={counts.hoy > 0 ? "warning" : "neutral"}
          meta="Visitas y seguimientos con fecha de hoy"
        />
        <StatCard
          label="Vencidos / Urgente"
          value={counts.vencidos.toLocaleString("es-CO")}
          tone={counts.vencidos > 0 ? "danger" : "success"}
          meta="Tareas vencidas y visitas no realizadas"
        />
        <StatCard
          label="Seguimientos pendientes"
          value={allTasks.filter((t) => t.status === "pendiente").length.toLocaleString("es-CO")}
          tone={allTasks.filter((t) => t.status === "pendiente").length > 0 ? "warning" : "success"}
          meta="Tareas abiertas por ejecutar"
        />
        <StatCard
          label="Visitas programadas"
          value={allVisits.filter((v) => v.status === "programada").length.toLocaleString("es-CO")}
          tone="info"
          meta="Visitas con estado programada"
        />
      </div>

      <AgendaFilters active={view} counts={counts} />

      <SectionCard
        title={
          view === "hoy"
            ? "Foco de hoy"
            : view === "semana"
              ? "Agenda de la semana"
              : "Vencidos y urgentes"
        }
        description={
          view === "hoy"
            ? "Visitas de hoy y tareas que vencen o están vencidas."
            : view === "semana"
              ? "Todas las visitas y seguimientos programados para esta semana."
              : "Tareas vencidas y visitas no realizadas que requieren atención."
        }
      >
        <AgendaQueue
          items={items}
          emptyTitle={
            view === "hoy"
              ? "Hoy no hay compromisos"
              : view === "semana"
                ? "Sin actividades esta semana"
                : "Sin elementos vencidos"
          }
          emptyDescription={
            view === "hoy"
              ? "La agenda del día está limpia. Puedes cargar una visita o un seguimiento nuevo."
              : view === "semana"
                ? "No hay visitas ni seguimientos programados para esta semana."
                : "No hay tareas vencidas ni visitas no realizadas."
          }
        />
      </SectionCard>
    </div>
  );
}
