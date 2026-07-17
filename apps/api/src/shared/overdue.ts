import { FollowUpTaskStatus, Prisma, VisitStatus } from "@prisma/client";

/**
 * REGLA UNICA DE "VENCIDO".
 *
 * En este repo NO hay scheduler (ni @Cron, ni ScheduleModule, ni colas). El
 * paso del tiempo, por tanto, no puede cambiar ninguna columna: `status` solo
 * cambia cuando un humano lo cambia. Cualquier codigo que lea la columna
 * esperando que signifique "ya paso la fecha" esta roto por construccion.
 *
 * Por eso "vencido" se DERIVA en lectura:
 *
 *     vencido = el estado no lo ha zanjado un humano  Y  la fecha ya paso
 *
 * Los valores de enum `vencida` / `no_realizada` se CONSERVAN: siguen sirviendo
 * para el caso manual ("la visita realmente no se hizo"), que es una decision
 * humana, no una consecuencia del reloj.
 *
 * Este modulo es la unica definicion de la regla. El fragmento Prisma y el
 * predicado en memoria DEBEN coincidir: si divergen, la lista de vencidos y el
 * contador de vencidos dejan de cuadrar, que es exactamente el bug AGEN-02.
 */

/** Estados de visita ya zanjados por un humano: el reloj ya no opina. */
export const VISIT_SETTLED_STATUSES: VisitStatus[] = [
  VisitStatus.completada,
  VisitStatus.cancelada,
  VisitStatus.no_realizada,
];

/**
 * Estados de tarea ya zanjados por un humano.
 *
 * `vencida` NO esta aqui a proposito: es un marcador de "se paso la fecha",
 * no una resolucion. Filas historicas marcadas `vencida` por el difunto
 * markOverdue deben seguir contando como vencidas mientras su dueAt este en el
 * pasado, y dejar de contar si alguien reprograma la tarea al futuro.
 */
export const FOLLOW_UP_TASK_SETTLED_STATUSES: FollowUpTaskStatus[] = [
  FollowUpTaskStatus.completada,
];

function isPast(instant: Date | string, now: Date): boolean {
  const time = instant instanceof Date ? instant.getTime() : new Date(instant).getTime();
  return time < now.getTime();
}

export function isVisitOverdue(
  visit: { status: VisitStatus; scheduledAt: Date | string },
  now: Date,
): boolean {
  return !VISIT_SETTLED_STATUSES.includes(visit.status) && isPast(visit.scheduledAt, now);
}

export function isFollowUpTaskOverdue(
  task: { status: FollowUpTaskStatus; dueAt: Date | string },
  now: Date,
): boolean {
  return (
    !FOLLOW_UP_TASK_SETTLED_STATUSES.includes(task.status) && isPast(task.dueAt, now)
  );
}

/** Fragmento Prisma equivalente a `isVisitOverdue`. */
export function visitOverdueWhere(now: Date): Prisma.VisitWhereInput {
  return {
    status: { notIn: VISIT_SETTLED_STATUSES },
    scheduledAt: { lt: now },
  };
}

/** Fragmento Prisma equivalente a `isFollowUpTaskOverdue`. */
export function followUpTaskOverdueWhere(now: Date): Prisma.FollowUpTaskWhereInput {
  return {
    status: { notIn: FOLLOW_UP_TASK_SETTLED_STATUSES },
    dueAt: { lt: now },
  };
}

/**
 * ZONA HORARIA (VIS-03).
 *
 * Las columnas son TIMESTAMP(3) sin zona y no se migran (decision de producto).
 * Los limites de dia se calculan SIEMPRE en una zona explicita, nunca en la del
 * proceso: si el host corre en UTC, "hoy" segun el servidor empieza 5 horas
 * antes que "hoy" en Colombia y la agenda muestra el dia equivocado.
 */
export const BOGOTA_TIME_ZONE = "America/Bogota";

const zoneFormatterCache = new Map<string, Intl.DateTimeFormat>();

function zoneFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = zoneFormatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    zoneFormatterCache.set(timeZone, formatter);
  }
  return formatter;
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Hora de pared que marca `instant` en `timeZone`. */
function wallClockIn(instant: Date, timeZone: string): WallClock {
  const parts = zoneFormatter(timeZone).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  // `hour12: false` puede rendir 24 para medianoche en algunos entornos.
  const hour = get("hour") % 24;
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour,
    minute: get("minute"),
    second: get("second"),
  };
}

/** Desfase de la zona respecto de UTC, en ms, en ese instante. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const wall = wallClockIn(instant, timeZone);
  const asUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
    instant.getUTCMilliseconds(),
  );
  return asUtc - instant.getTime();
}

/**
 * Instante UTC en el que `timeZone` marca la hora de pared indicada.
 * Se refina una vez para cubrir zonas con DST (Bogota no lo tiene, pero la
 * funcion no debe depender de ello).
 */
function wallClockToInstant(wall: WallClock, ms: number, timeZone: string): Date {
  const guess = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
    ms,
  );
  const firstOffset = zoneOffsetMs(new Date(guess), timeZone);
  const candidate = new Date(guess - firstOffset);
  const secondOffset = zoneOffsetMs(candidate, timeZone);
  return secondOffset === firstOffset ? candidate : new Date(guess - secondOffset);
}

export interface DateRange {
  start: Date;
  end: Date;
}

/** Dia natural (00:00:00.000 - 23:59:59.999) de `now` en `timeZone`. */
export function dayRangeInZone(now: Date, timeZone: string = BOGOTA_TIME_ZONE): DateRange {
  const wall = wallClockIn(now, timeZone);
  const start = wallClockToInstant(
    { ...wall, hour: 0, minute: 0, second: 0 },
    0,
    timeZone,
  );
  const end = wallClockToInstant(
    { ...wall, hour: 23, minute: 59, second: 59 },
    999,
    timeZone,
  );
  return { start, end };
}

/** Semana (lunes 00:00:00.000 - domingo 23:59:59.999) de `now` en `timeZone`. */
export function weekRangeInZone(now: Date, timeZone: string = BOGOTA_TIME_ZONE): DateRange {
  const wall = wallClockIn(now, timeZone);
  // getUTCDay sobre la fecha de pared da el dia de la semana en la zona.
  const weekday = new Date(Date.UTC(wall.year, wall.month - 1, wall.day)).getUTCDay();
  const daysFromMonday = weekday === 0 ? 6 : weekday - 1;

  const monday = new Date(Date.UTC(wall.year, wall.month - 1, wall.day - daysFromMonday));
  const sunday = new Date(Date.UTC(wall.year, wall.month - 1, wall.day - daysFromMonday + 6));

  const start = wallClockToInstant(
    {
      year: monday.getUTCFullYear(),
      month: monday.getUTCMonth() + 1,
      day: monday.getUTCDate(),
      hour: 0,
      minute: 0,
      second: 0,
    },
    0,
    timeZone,
  );
  const end = wallClockToInstant(
    {
      year: sunday.getUTCFullYear(),
      month: sunday.getUTCMonth() + 1,
      day: sunday.getUTCDate(),
      hour: 23,
      minute: 59,
      second: 59,
    },
    999,
    timeZone,
  );
  return { start, end };
}
