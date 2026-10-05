/**
 * Grilla mensual del date-picker y utilidades de FECHA NATURAL (VIS-03).
 *
 * Mismo problema que `datetime.ts` reporta: la zona del proceso no puede
 * filtrar en fechas del negocio. Aquí la defensa es la raíz: una fecha es la
 * terna (año, mes, día). Nada se parsea de cadenas con `new Date(string)` —
 * que en UTC-5 convierte "2026-07-16" en el 15 a las 19:00 — y todo el
 * aritmético pasa por `Date.UTC` (instante exacto de una terna, leído con
 * getters *UTC*), así el resultado es idéntico en Bogotá, Colombia como en un
 * host en America/Bogota o en UTC+8.
 *
 * La semana arranca el LUNES: es la convención que la agenda ya usa
 * (`urgency-badge.tsx` y `(app)/agenda/page.tsx` calculan `diffToMonday`).
 */

/** Celda de una grilla mensual: siempre `iso`, `day`, `month`, `year` exactos. */
export interface MonthCell {
  iso: string;
  year: number;
  month: number;
  day: number;
  /** El día pertenece al mes que se está mostrando (falso = relleno). */
  inMonth: boolean;
}

/** Terna validada de una fecha natural. */
export interface ParsedIsoDate {
  year: number;
  month: number;
  day: number;
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

const pad2 = (n: number) => String(n).padStart(2, "0");
const padYear = (n: number) => String(n).padStart(4, "0");

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Días naturales del mes: 29 en febrero bisiesto, 0 si el mes no existe. */
export function daysInMonth(year: number, month: number): number {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return 0;
  return DAYS_IN_MONTH[month - 1] + (month === 2 && isLeapYear(year) ? 1 : 0);
}

/**
 * ISO `YYYY-MM-DD` exactamente desde la terna, o `null` si la fecha no existe.
 * Nunca pasa por `new Date(...)`: el cero de relleno sale del defecto de
 * formateo, no de una zona.
 */
export function isoFromParts(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < 1 || month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return `${padYear(year)}-${pad2(month)}-${pad2(day)}`;
}

/** Parseo ESTRICTO de `YYYY-MM-DD` (4/2/2 dígitos; "2026-2-16" no vale). */
export function parseIsoDate(value: string): ParsedIsoDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // El año 0000 no existe: ninguna fecha navegable del sistema lo usa y dejar
  // pasar el cero rompería a quién reconstruya la terna (p.ej. `formatDateShort`
  // con `Date.UTC`). El guard vive aquí (antes lo parcheaba `parseMonthParam`).
  if (year < 1) return null;
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

/**
 * Día de la semana del día 1 del mes, con LUNES = 0 (hasta domingo = 6),
 * igual que la semana comercial de la agenda.
 */
export function firstWeekday(year: number, month: number): number {
  const jsWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0 = domingo JS
  return (jsWeekday + 6) % 7;
}

/**
 * Grilla del mes: SIEMPRE 42 celdas (6 semanas completas, lunes primero).
 * El relleno antes/después emite el ISO real del día Hermano del mes vecino,
 * para poder renderizarlo tenue y pinning-free.
 */
export function monthGrid(year: number, month: number): MonthCell[] {
  const lead = firstWeekday(year, month);
  const cells: MonthCell[] = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(Date.UTC(year, month - 1, i + 1 - lead));
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth() + 1;
    const d = date.getUTCDate();
    cells.push({
      iso: `${padYear(y)}-${pad2(m)}-${pad2(d)}`,
      year: y,
      month: m,
      day: d,
      inMonth: m === month,
    });
  }
  return cells;
}

/** Suma meses exactos sin salirse de 1-12 (cruce de año incluido). */
export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 + 1 };
}

/**
 * Hoy como FECHA NATURAL local (hora de pared del navegador), no la UTC:
 * a las 23:59 en Bogotá el día natural sigue siendo el 16 aunque en UTC
 * ya sea el 17.
 */
export function todayIso(now: Date = new Date()): string {
  return `${padYear(now.getFullYear())}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

const shortDateFormatter = new Intl.DateTimeFormat("es-CO", {
  timeZone: "UTC",
  day: "2-digit",
  month: "short",
  year: "numeric",
});

/** Trigger del picker: "16 de jul de 2026" (es-CO, zona fija, sin mover el día). */
export function formatDateShort(iso: string): string {
  const parsed = parseIsoDate(iso);
  if (!parsed) return "";
  return shortDateFormatter.format(new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)));
}

const monthTitleFormatter = new Intl.DateTimeFormat("es-CO", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});

/** Encabezado del calendario: "julio de 2026". */
export function formatMonthTitle(year: number, month: number): string {
  return monthTitleFormatter.format(new Date(Date.UTC(year, month - 1, 15)));
}

const weekdayFormatter = new Intl.DateTimeFormat("es-CO", {
  timeZone: "UTC",
  weekday: "short",
});

/** Cabecera de la grilla: una etiqueta por columna, lunes primero. */
export function weekdayShortLabels(): string[] {
  // El 6 de enero de 2020 fue lunes: siete días desde ahí cubren lun…dom.
  return Array.from({ length: 7 }, (_, i) =>
    weekdayFormatter.format(new Date(Date.UTC(2020, 0, 6 + i))),
  );
}
