import { AgendaFilters } from "@/components/agenda/agenda-filters";
import { AgendaQueue } from "@/components/agenda/agenda-queue";
import type { AgendaView } from "@/components/agenda/agenda-filters";
import { AgendaMonthGrid } from "@/components/agenda/agenda-month-grid";
import { ButtonLink } from "@/components/ui/button-link";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatCard } from "@/components/ui/stat-card";
import { apiFetch } from "@/lib/api.server";
import { isSameDayInBogota, dayKeyInBogota } from "@/lib/datetime";
import { filterByMonth, indexByDay, parseMonthParam } from "@/lib/agenda-month";
import { getCurrentUser } from "@/lib/auth.server";
import { canCreate } from "@/lib/auth";

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
  /** Derivado por el API con la regla compartida. El front no lo recalcula. */
  isOverdue: boolean;
}

interface FollowUpTask {
  id: string;
  customer: Customer | null;
  dueAt: string;
  title: string;
  type: string;
  status: string;
  /** Derivado por el API con la regla compartida. El front no lo recalcula. */
  isOverdue: boolean;
}

interface AgendaItem {
  id: string;
  kind: "visit" | "task";
  title: string;
  customer: Customer | null;
  scheduledAt: string;
  status: string;
  isOverdue: boolean;
  type?: string;
}

function toAgendaItems(visits: Visit[], tasks: FollowUpTask[]): AgendaItem[] {
  const visitItems = visits.map<AgendaItem>((visit) => ({
    id: visit.id,
    kind: "visit",
    title: visit.summary || "Visita programada",
    customer: visit.customer,
    scheduledAt: visit.scheduledAt,
    status: visit.status,
    isOverdue: visit.isOverdue,
  }));

  const taskItems = tasks.map<AgendaItem>((task) => ({
    id: task.id,
    kind: "task",
    title: task.title,
    customer: task.customer,
    scheduledAt: task.dueAt,
    status: task.status,
    isOverdue: task.isOverdue,
    type: task.type,
  }));

  return [...visitItems, ...taskItems].sort(
    (left, right) =>
      new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime(),
  );
}

function isDueToday(task: FollowUpTask): boolean {
  return isSameDayInBogota(task.dueAt, new Date());
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const view = (typeof params.view === "string" ? params.view : "hoy") as AgendaView;

  let visits: Visit[] = [];
  let tasks: FollowUpTask[] = [];

  if (view === "hoy") {
    const [visitsRes, tasksDueTodayRes, tasksOverdueRes] = await Promise.all([
      apiFetch("/visits?today=true"),
      apiFetch("/follow-up-tasks?dueToday=true"),
      apiFetch("/follow-up-tasks?overdue=true"),
    ]);
    visits = (visitsRes.ok ? await visitsRes.json() : []) as Visit[];
    const dueToday = (tasksDueTodayRes.ok ? await tasksDueTodayRes.json() : []) as FollowUpTask[];
    const overdue = (tasksOverdueRes.ok ? await tasksOverdueRes.json() : []) as FollowUpTask[];
    const taskIds = new Set(dueToday.map((t: FollowUpTask) => t.id));
    tasks = [...dueToday, ...overdue.filter((t: FollowUpTask) => !taskIds.has(t.id))];
  } else if (view === "semana") {
    const [visitsRes, tasksRes] = await Promise.all([
      apiFetch("/visits?thisWeek=true"),
      apiFetch("/follow-up-tasks?thisWeek=true"),
    ]);
    visits = (visitsRes.ok ? await visitsRes.json() : []) as Visit[];
    tasks = (tasksRes.ok ? await tasksRes.json() : []) as FollowUpTask[];
  } else if (view === "vencidos") {
    const [visitsRes, tasksRes] = await Promise.all([
      apiFetch("/visits?overdue=true"),
      apiFetch("/follow-up-tasks?overdue=true"),
    ]);
    visits = (visitsRes.ok ? await visitsRes.json() : []) as Visit[];
    tasks = (tasksRes.ok ? await tasksRes.json() : []) as FollowUpTask[];
  }

  const items = toAgendaItems(visits, tasks);

  const allVisitsRes = await apiFetch("/visits");
  const allTasksRes = await apiFetch("/follow-up-tasks");
  const allVisits = (allVisitsRes.ok ? await allVisitsRes.json() : []) as Visit[];
  const allTasks = (allTasksRes.ok ? await allTasksRes.json() : []) as FollowUpTask[];

  const todayVisits = allVisits.filter((v) => isSameDayInBogota(v.scheduledAt, new Date()));

  const overdueTasks = allTasks.filter((t) => t.isOverdue);
  const overdueVisits = allVisits.filter((v) => v.isOverdue);
  const dueTodayTasks = allTasks.filter((t) => isDueToday(t));

  const user = await getCurrentUser();
  const userRole = user?.role ?? null;

  // ── Vista mensual (VIS-03) ────────────────────────────────────────────────
  // El API de /visits y /follow-up-tasks no expone parámetros from/to (solo
  // status/today/thisWeek/overdue/assignedToMe/customerId), así que el mes se
  // acota aquí, sobre la data que esta página YA trae para las tarjetas de
  // estadísticas: ninguna petición adicional y ningún rango anual pedido de
  // una sola vez (Review Focus del plan). El alcance es el mismo de las
  // vistas hoy/semana/vencidos: mismas peticiones, mismo usuario, sin filtro
  // por vendedor que puentea (la agenda es la cola compartida del equipo).
  const today = dayKeyInBogota(new Date());
  const shownMonth = parseMonthParam(
    typeof params.mes === "string" ? params.mes : undefined,
    today,
  );
  // Los items de la grilla salen de la lista completa (no de la ventana de la
  // vista lista): en `view=mes` las peticiones de hoy/semana/vencidos no corren.
  // El índice agrupa TODA la lista (las celdas de relleno de monthGrid son días
  // reales de los meses vecinos y pintan sus compromisos tenues); la cuenta de
  // la pestaña Mes sí queda acotada al mes mostrado.
  const dayItems = toAgendaItems(allVisits, allTasks).map((item) => ({
    ...item,
    day: dayKeyInBogota(item.scheduledAt),
  }));
  const monthItems = filterByMonth(dayItems, shownMonth.year, shownMonth.month);
  const byDay = indexByDay(dayItems);

  const counts: Record<AgendaView, number> = {
    hoy: todayVisits.length + dueTodayTasks.length + overdueTasks.filter((t) => !isDueToday(t)).length,
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
    vencidos: overdueTasks.length + overdueVisits.length,
    mes: monthItems.length,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="OPERACIÓN"
        title="Agenda"
        description="Semana comercial consolidada con visitas, seguimientos y foco inmediato del equipo."
        actions={
          <>
            {canCreate(userRole, "visit") && (
              <ButtonLink href="/visits/new" variant="secondary">
                Nueva visita
              </ButtonLink>
            )}
            {canCreate(userRole, "followUp") && (
              <ButtonLink href="/follow-ups/new">Nuevo seguimiento</ButtonLink>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
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
          meta="Visitas y seguimientos cuya fecha ya pasó"
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
              : view === "mes"
                ? "Vista mensual"
                : "Vencidos y urgentes"
        }
        description={
          view === "hoy"
            ? "Visitas de hoy y tareas que vencen o están vencidas."
            : view === "semana"
              ? "Todas las visitas y seguimientos programados para esta semana."
              : view === "mes"
                ? "Visitas y seguimientos del mes. Clic en un compromiso para abrir su detalle."
                : "Visitas y seguimientos cuya fecha ya pasó y siguen sin resolver."
        }
      >
        {view === "mes" ? (
          <AgendaMonthGrid
            year={shownMonth.year}
            month={shownMonth.month}
            byDay={byDay}
            today={today}
          />
        ) : (
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
                  : "No hay visitas ni seguimientos vencidos."
            }
          />
        )}
      </SectionCard>
    </div>
  );
}
