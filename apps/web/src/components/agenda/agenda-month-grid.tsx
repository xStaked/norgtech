import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatMonthParam } from "@/lib/agenda-month";
import {
  addMonths,
  formatMonthTitle,
  monthGrid,
  parseIsoDate,
  weekdayShortLabels,
} from "@/lib/date-grid";
import { shortTimeFormatter } from "@/lib/datetime";

/**
 * Vista mensual de la agenda (VIS-03). Es un componente de SERVIDOR: la
 * navegación de mes va por URL (`/agenda?view=mes&mes=YYYY-MM`, mismo patrón
 * de Links que las pestañas) y los compromisos son Links al detalle, así no
 * hay estado de cliente que hidratar ni lógica de zona duplicada.
 *
 * La data llega agrupada por dia natural (`indexByDay` de `lib/agenda-month`)
 * sobre TODA la agenda de la página: las celdas de relleno de `monthGrid` son
 * días reales de los meses vecinos y pintan sus compromisos tenues. El día
 * viene de `dayKeyInBogota`, así que una visita de las 21:00 de Bogotá cae en
 * su día de pared, no en el día UTC (el desfase que reportó QA).
 */

export interface MonthAgendaItem {
  id: string;
  kind: "visit" | "task";
  title: string;
  customer: {
    id: string;
    displayName: string;
  } | null;
  scheduledAt: string;
  // `status` y `isOverdue` no los pinta esta vista directamente, pero completan
  // la misma forma del `AgendaItem` de la página para que el Map viaje por la
  // frontera sin casts.
  status: string;
  isOverdue: boolean;
  type?: string;
}

interface AgendaMonthGridProps {
  year: number;
  month: number;
  /** Dia natural → compromisos de ese día (toda la agenda; el mes se acota por las celdas que se piden). */
  byDay: Map<string, MonthAgendaItem[]>;
  /** Dia natural de hoy en la zona del negocio ("2026-10-05"). */
  today: string;
}

const KIND_LABELS: Record<MonthAgendaItem["kind"], string> = {
  visit: "Visita",
  task: "Seguimiento",
};

// Mismos colores de AgendaQueue: visita azul, seguimiento violeta; el rojo
// queda reservado para lo que el API ya marcó vencido (isOverdue derivado,
// el front no recalcula la regla).
const KIND_COLORS: Record<MonthAgendaItem["kind"], string> = {
  visit: "#0f5c8a",
  task: "#6d4ff0",
};
const OVERDUE_COLOR = "#b42318";

// 3 compromisos por celda: en un ancho de ~1/7 de tarjeta caben 3 chips de
// una línea; el resto se anuncia con "+N más", que enlaza a la lista de la
// agenda (misma página, filtro por defecto) donde vive el detalle.
const MAX_CHIPS_PER_CELL = 3;

const monthHref = (year: number, month: number) =>
  `/agenda?view=mes&mes=${formatMonthParam(year, month)}`;

export function AgendaMonthGrid({ year, month, byDay, today }: AgendaMonthGridProps) {
  const cells = monthGrid(year, month);
  const previous = addMonths(year, month, -1);
  const next = addMonths(year, month, 1);
  // El mes de "Hoy" sale del dia natural resuelto en la zona del negocio
  // (prop `today`), nunca de `new Date()` del servidor: en un host UTC, a las
  // 23:59 de Bogotá el mes ya habría corrido un día.
  const todayMonth = parseIsoDate(today);

  return (
    <div>
      <div className="flex items-center justify-between gap-2 pb-3">
        <div className="text-[13.5px] font-bold text-foreground">
          {formatMonthTitle(year, month)}
        </div>
        <div className="flex items-center gap-1">
          <Link
            aria-label="Mes anterior"
            href={monthHref(previous.year, previous.month)}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-[#f2f6fa] hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <ChevronLeftIcon aria-hidden="true" className="size-[15px]" />
          </Link>
          {todayMonth && (
            <Link
              aria-label="Ir al mes actual"
              href={monthHref(todayMonth.year, todayMonth.month)}
              className="inline-flex items-center rounded-md px-2 py-1 text-[11.5px] font-bold text-primary transition-colors outline-none hover:bg-[#f2f6fa] focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              Hoy
            </Link>
          )}
          <Link
            aria-label="Mes siguiente"
            href={monthHref(next.year, next.month)}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-[#f2f6fa] hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <ChevronRightIcon aria-hidden="true" className="size-[15px]" />
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-[10px] border border-border">
        <div className="grid grid-cols-7 border-b border-border bg-muted/40">
          {weekdayShortLabels().map((label) => (
            <span
              key={label}
              className="py-1.5 text-center text-[9.5px] font-extrabold uppercase tracking-[.07em] text-muted-foreground"
            >
              {label}
            </span>
          ))}
        </div>

        {/* Grilla fija de 42 celdas (6 semanas, lunes primero): la altura no
            salta al navegar de mes, igual que el date-picker. */}
        <div className="grid grid-cols-7">
          {cells.map((cell, index) => {
            const dayItems = byDay.get(cell.iso) ?? [];
            const shown = dayItems.slice(0, MAX_CHIPS_PER_CELL);
            const overflow = dayItems.length - shown.length;
            const isToday = cell.iso === today;
            return (
              <div
                key={cell.iso}
                aria-current={isToday ? "date" : undefined}
                className={cn(
                  "min-h-[92px] border-b border-r border-border/70 px-1.5 py-1",
                  index % 7 === 6 && "border-r-0",
                  index >= 35 && "border-b-0",
                  cell.inMonth ? "bg-card" : "bg-muted/30",
                  isToday && "bg-[#f2f6fa]",
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "text-[11.5px] tabular-nums",
                      cell.inMonth ? "font-bold text-foreground" : "font-semibold text-muted-foreground/60",
                      isToday && "font-extrabold text-primary",
                    )}
                  >
                    {cell.day}
                  </span>
                  {isToday && (
                    <span className="text-[9px] font-extrabold uppercase tracking-[.06em] text-primary">
                      Hoy
                    </span>
                  )}
                </div>

                <div className={cn("mt-1 space-y-1", !cell.inMonth && "opacity-60")}>
                  {shown.map((item) => {
                    const isVisit = item.kind === "visit";
                    return (
                      <Link
                        key={`${item.kind}-${item.id}`}
                        href={isVisit ? `/visits/${item.id}` : `/follow-ups/${item.id}`}
                        title={`${KIND_LABELS[item.kind]} · ${item.title}`}
                        className="flex items-center gap-1.5 rounded-md bg-muted/50 px-1.5 py-0.5 text-[10.5px] font-semibold no-underline transition-colors hover:bg-[#e6f0f6]"
                      >
                        <span
                          aria-hidden="true"
                          className="size-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: item.isOverdue ? OVERDUE_COLOR : KIND_COLORS[item.kind] }}
                        />
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {shortTimeFormatter.format(new Date(item.scheduledAt))}
                        </span>
                        <span className="min-w-0 truncate text-foreground">{item.title}</span>
                      </Link>
                    );
                  })}
                  {overflow > 0 && (
                    <Link
                      href="/agenda"
                      className="block rounded-md px-1.5 text-[10px] font-bold text-muted-foreground no-underline transition-colors outline-none hover:bg-[#e6f0f6] hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40"
                    >
                      +{overflow} más
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 pt-3 text-[11px] font-semibold text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-1.5 rounded-full" style={{ backgroundColor: KIND_COLORS.visit }} />
          Visita
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-1.5 rounded-full" style={{ backgroundColor: KIND_COLORS.task }} />
          Seguimiento
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-1.5 rounded-full" style={{ backgroundColor: OVERDUE_COLOR }} />
          Vencido
        </span>
      </div>
    </div>
  );
}
