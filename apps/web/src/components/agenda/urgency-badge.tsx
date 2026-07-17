import { StatusBadge } from "@/components/ui/status-badge";
import type { CrmStatusTone } from "@/components/ui/theme";
import { isSameDayInBogota } from "@/lib/datetime";

export type UrgencyLevel = "vencido" | "vence_hoy" | "proximo" | "esta_semana" | "futuro";

interface UrgencyBadgeProps {
  level: UrgencyLevel;
}

const levelLabels: Record<UrgencyLevel, string> = {
  vencido: "Vencido",
  vence_hoy: "Vence hoy",
  proximo: "Próximo",
  esta_semana: "Esta semana",
  futuro: "Futuro",
};

const levelTones: Record<UrgencyLevel, CrmStatusTone> = {
  vencido: "danger",
  vence_hoy: "warning",
  proximo: "info",
  esta_semana: "neutral",
  futuro: "neutral",
};

export function UrgencyBadge({ level }: UrgencyBadgeProps) {
  return <StatusBadge tone={levelTones[level]}>{levelLabels[level]}</StatusBadge>;
}

/**
 * "Vencido" NO se decide aqui: lo decide el API (`isOverdue`), que aplica la
 * regla compartida de src/shared/overdue.ts. Antes esta funcion tenia su propia
 * version del predicado -- y discrepaba: una tarea vencida esta misma manana se
 * pintaba "Vence hoy" mientras el API ya la contaba como vencida.
 *
 * Lo que queda aqui es presentacion pura: cuanto falta para la fecha.
 */
export function computeUrgency(dateString: string, isOverdue: boolean): UrgencyLevel {
  if (isOverdue) return "vencido";

  const now = new Date();
  const date = new Date(dateString);

  if (isSameDayInBogota(date, now)) return "vence_hoy";

  const dayDiff = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (dayDiff <= 2) return "proximo";

  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + diffToMonday);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  if (date.getTime() >= weekStart.getTime() && date.getTime() <= weekEnd.getTime()) {
    return "esta_semana";
  }

  return "futuro";
}
