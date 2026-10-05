/**
 * Acotación y agrupación de la agenda para la vista mensual (VIS-03, Task 3).
 *
 * El API de `/visits` y `/follow-up-tasks` no expone parámetros `from`/`to`
 * (solo status/today/thisWeek/overdue/assignedToMe/customerId), así que la
 * vista mensual acota EL MES dentro de la data que la página ya trae para sus
 * tarjetas de estadísticas: ninguna petición nueva y ningún rango anual pedido
 * de una sola vez (Review Focus del plan).
 *
 * El módulo no ve instantes ni zonas: cada item llega con su `day` ya resuelto
 * a dia natural por `dayKeyInBogota` (datetime.ts). Aquí solo se agrupa y se
 * compara contra la terna del mes con el mismo parseo estricto de
 * `date-grid.ts`, de modo que el resultado no depende de la zona del proceso.
 */

import { isoFromParts, parseIsoDate } from "./date-grid";

/** Item de agenda que ya conoce su dia natural ("2026-07-16"). */
export interface DayKeyed {
  day: string;
}

/**
 * `mes=YYYY-MM` del query de `/agenda` a terna de mes. Cualquier valor que no
 * sea exactamente ese formato (o un mes inexistente) cae al mes de respaldo:
 * el dia natural de HOY emitido por `dayKeyInBogota` ("2026-10-05"), cuyo
 * formato fijo permite recortar año y mes sin reparsear.
 */
export function parseMonthParam(
  value: string | undefined,
  todayDayKey: string,
): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  // El parseo estricto de date-grid valida el mes; el año >= 1 se exige aquí
  // porque `parseIsoDate` no lo hace (ese guard vive en `isoFromParts`) y
  // "0000-05" no es un mes navegable de la agenda.
  const candidate = match ? parseIsoDate(`${match[1]}-${match[2]}-01`) : null;
  if (candidate && candidate.year >= 1) return { year: candidate.year, month: candidate.month };
  return { year: Number(todayDayKey.slice(0, 4)), month: Number(todayDayKey.slice(5, 7)) };
}

/** Terna de mes al parámetro de URL `YYYY-MM` (inverso de `parseMonthParam`). */
export function formatMonthParam(year: number, month: number): string {
  return (isoFromParts(year, month, 1) ?? "").slice(0, 7);
}

/**
 * Deja los items cuyo dia natural cae en el mes mostrado. Un `day` malformado
 * no puede ubicarse en ninguna celda, así que se excluye (en la práctica no
 * ocurre: `dayKeyInBogota` siempre emite `YYYY-MM-DD`).
 */
export function filterByMonth<T extends DayKeyed>(items: T[], year: number, month: number): T[] {
  return items.filter(({ day }) => {
    const parsed = parseIsoDate(day);
    return parsed !== null && parsed.year === year && parsed.month === month;
  });
}

/** Índice dia natural → items de ese día, conservando el orden de llegada. */
export function indexByDay<T extends DayKeyed>(items: T[]): Map<string, T[]> {
  const byDay = new Map<string, T[]>();
  for (const item of items) {
    const group = byDay.get(item.day);
    if (group) {
      group.push(item);
    } else {
      byDay.set(item.day, [item]);
    }
  }
  return byDay;
}
