import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { BOGOTA_OFFSET } from "../../shared/instant";
import { AnalyticsFiltersQueryDto } from "./dto/analytics-filters.query.dto";
import { AuthUser } from "../auth/types/authenticated-request";

/**
 * REGLAS TRANSVERSALES DE ANALITICA (docs/analytics-spec.md §2.3).
 *
 * Las cuatro pantallas comparten filtros y, sobre todo, comparten la forma de
 * ACOTAR. Si cada service armara su propio where, los numeros dejarian de
 * cuadrar entre pantallas — que es exactamente el problema que el contrato
 * existe para evitar. Todo el acotado vive aqui.
 */

export const DEFAULT_WINDOW_DAYS = 90;
export const MAX_RANGE_DAYS = 1096; // 3 años: tope para no barrer la tabla entera.

export type Granularity = "day" | "week" | "month";
export type Currency = "COP" | "USD";

export interface ResolvedFilters {
  from: Date;
  to: Date;
  fromDate: string;
  toDate: string;
  currency: Currency;
  companyId: string | null;
  sellerUserId: string | null;
  zoneId: string | null;
  segmentId: string | null;
  granularity: Granularity;
  csv: boolean;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** `2026-07-25` -> instante del primer/ultimo milisegundo de ese dia en Bogota. */
function dayBoundary(date: string, edge: "start" | "end"): Date {
  if (!DATE_ONLY.test(date)) {
    throw new BadRequestException(`Fecha invalida: "${date}". Formato esperado YYYY-MM-DD.`);
  }
  const time = edge === "start" ? "00:00:00.000" : "23:59:59.999";
  const parsed = new Date(`${date}T${time}${BOGOTA_OFFSET}`);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`Fecha invalida: "${date}".`);
  }
  return parsed;
}

/** Fecha de pared en Bogota de un instante, como `YYYY-MM-DD`. */
export function bogotaDate(instant: Date): string {
  return new Date(instant.getTime() - 5 * 3_600_000).toISOString().slice(0, 10);
}

function shiftDays(date: string, days: number): string {
  const shifted = new Date(`${date}T12:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/**
 * Normaliza los query params y aplica el forzado por rol.
 *
 * `sellerUserId` NO se toma del query para un comercial: se fuerza al usuario
 * autenticado. Devolvemos el valor aplicado (no el pedido) para que el front
 * pueda pintar la barra de filtros con lo que realmente se uso.
 */
export function resolveFilters(
  query: AnalyticsFiltersQueryDto,
  user: AuthUser,
): ResolvedFilters {
  const toDate = query.to ?? bogotaDate(new Date());
  const fromDate = query.from ?? shiftDays(toDate, -DEFAULT_WINDOW_DAYS);

  const from = dayBoundary(fromDate, "start");
  const to = dayBoundary(toDate, "end");

  if (from > to) {
    throw new BadRequestException("El rango es invalido: `from` es posterior a `to`.");
  }
  const spanDays = Math.round((to.getTime() - from.getTime()) / 86_400_000);
  if (spanDays > MAX_RANGE_DAYS) {
    throw new BadRequestException(`El rango no puede superar ${MAX_RANGE_DAYS} dias.`);
  }

  return {
    from,
    to,
    fromDate,
    toDate,
    currency: query.currency ?? "COP",
    companyId: query.companyId ?? null,
    // Un comercial solo se ve a si mismo, mande lo que mande. Hoy el modulo no
    // lo deja entrar (§2.4), pero la regla queda por si se abre el acceso.
    sellerUserId: user.role === "comercial" ? user.id : query.sellerUserId ?? null,
    zoneId: query.zoneId ?? null,
    segmentId: query.segmentId ?? null,
    granularity: query.granularity ?? "month",
    csv: query.format === "csv",
  };
}

/** Igual que `resolveFilters` pero para una foto a una fecha (cartera). */
export function resolveAsOf(query: AnalyticsFiltersQueryDto, user: AuthUser) {
  const asOfDate = query.asOf ?? bogotaDate(new Date());
  const filters = resolveFilters(
    { ...query, from: shiftDays(asOfDate, -DEFAULT_WINDOW_DAYS), to: asOfDate },
    user,
  );
  return { ...filters, asOf: dayBoundary(asOfDate, "end"), asOfDate };
}

/**
 * Acotado por CLIENTE: moneda, empresa, segmento y zona.
 *
 * La moneda no vive en `Order` ni en `Invoice`: la fuente de verdad es
 * `Customer.currency`. Por eso todo filtro de moneda es, en realidad, un filtro
 * por cliente — y por eso nunca se suman monedas distintas.
 */
export function customerWhere(filters: ResolvedFilters): Prisma.CustomerWhereInput {
  return {
    currency: filters.currency,
    ...(filters.companyId ? { companyId: filters.companyId } : {}),
    ...(filters.segmentId ? { segmentId: filters.segmentId } : {}),
    ...(filters.zoneId
      ? { customerZones: { some: { zoneId: filters.zoneId, isActive: true } } }
      : {}),
  };
}

/** Where de pedidos con todas las reglas del contrato aplicadas. */
export function orderWhere(filters: ResolvedFilters): Prisma.OrderWhereInput {
  return {
    orderDate: { gte: filters.from, lte: filters.to },
    customer: customerWhere(filters),
    ...(filters.companyId ? { companyId: filters.companyId } : {}),
    // DASH-04: la venta se atribuye a quien la VENDIO, no al vendedor asignado
    // al cliente. Misma regla que seller-goals y el dashboard comercial.
    ...(filters.sellerUserId ? { sellerUserId: filters.sellerUserId } : {}),
    ...(filters.zoneId ? { customerZone: { zoneId: filters.zoneId } } : {}),
  };
}

/**
 * Where de devoluciones, acotado con EL MISMO criterio que los pedidos.
 *
 * Una devolucion no tiene `companyId` ni vendedor propios: los hereda de su
 * pedido o de su factura. Sin este acotado, `neto = ventas(empresa X) −
 * devoluciones(TODAS)` sub-reporta el neto de cada empresa (RET-02).
 *
 * Devoluciones SIN pedido NI factura: con empresa seleccionada NO se cuentan
 * (no se pueden atribuir sin adivinar, y contarlas en todas restaria la misma
 * plata varias veces). Sin empresa seleccionada si cuentan.
 */
export function returnWhere(filters: ResolvedFilters): Prisma.ReturnWhereInput {
  const scoped: Prisma.ReturnWhereInput[] = [];

  if (filters.companyId) {
    scoped.push({
      OR: [
        { order: { companyId: filters.companyId } },
        { invoice: { companyId: filters.companyId } },
      ],
    });
  }
  if (filters.sellerUserId) {
    // El vendedor de una devolucion es el del pedido devuelto. Una devolucion
    // sin pedido no tiene vendedor determinable y no entra en el panel de nadie.
    scoped.push({ order: { sellerUserId: filters.sellerUserId } });
  }
  if (filters.zoneId) {
    scoped.push({ order: { customerZone: { zoneId: filters.zoneId } } });
  }

  return {
    returnDate: { gte: filters.from, lte: filters.to },
    customer: customerWhere(filters),
    ...(scoped.length > 0 ? { AND: scoped } : {}),
  };
}

// --- numeros ---------------------------------------------------------------

export function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  if (value && typeof value === "object" && "toNumber" in value) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return 0;
}

export function money(value: number): number {
  return Math.round(value * 100) / 100;
}

export function quantity(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/** Porcentaje con un decimal. Divisor 0 -> 0, nunca NaN ni Infinity. */
export function percent(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function ratio(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return money(numerator / denominator);
}

export function days(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

// --- agrupacion temporal ---------------------------------------------------

/** Clave de bucket de un instante segun la granularidad, en hora de Bogota. */
export function bucketKey(instant: Date, granularity: Granularity): string {
  const date = bogotaDate(instant);
  if (granularity === "day") return date;
  if (granularity === "month") return date.slice(0, 7);
  // Semana ISO: lunes de la semana a la que pertenece la fecha.
  const utc = new Date(`${date}T12:00:00.000Z`);
  const weekday = utc.getUTCDay();
  utc.setUTCDate(utc.getUTCDate() - (weekday === 0 ? 6 : weekday - 1));
  return utc.toISOString().slice(0, 10);
}

/** Todos los buckets del rango, incluidos los vacios (una serie sin huecos). */
export function bucketsBetween(from: Date, to: Date, granularity: Granularity): string[] {
  const keys: string[] = [];
  const cursor = new Date(`${bogotaDate(from)}T12:00:00.000Z`);
  const last = bucketKey(to, granularity);
  let guard = 0;
  while (guard < 4000) {
    const key = bucketKey(new Date(cursor.getTime() + 5 * 3_600_000), granularity);
    if (keys[keys.length - 1] !== key) keys.push(key);
    if (key === last) break;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    guard += 1;
  }
  return keys;
}

/** Mismo rango, un año antes: el unico comparativo del contrato. */
export function previousYearRange(filters: ResolvedFilters) {
  const shift = (date: string) => {
    const parsed = new Date(`${date}T12:00:00.000Z`);
    parsed.setUTCFullYear(parsed.getUTCFullYear() - 1);
    return parsed.toISOString().slice(0, 10);
  };
  const fromDate = shift(filters.fromDate);
  const toDate = shift(filters.toDate);
  return {
    fromDate,
    toDate,
    from: dayBoundary(fromDate, "start"),
    to: dayBoundary(toDate, "end"),
  };
}

// --- csv -------------------------------------------------------------------

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null;
}

/**
 * CSV con BOM y separador `;`: Excel en es-CO abre `,` como decimal, asi que un
 * CSV separado por comas le sale todo en una columna.
 */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const escape = (value: string | number | null) => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [columns.map((column) => escape(column.header)).join(";")];
  for (const row of rows) {
    lines.push(columns.map((column) => escape(column.value(row))).join(";"));
  }
  return `﻿${lines.join("\n")}`;
}

/** Envoltura comun de las 4 pantallas (docs/analytics-spec.md §2.2). */
export function envelope(filters: ResolvedFilters) {
  return {
    range: {
      from: filters.fromDate,
      to: filters.toDate,
      granularity: filters.granularity,
    },
    currency: filters.currency,
    filters: {
      companyId: filters.companyId,
      sellerUserId: filters.sellerUserId,
      zoneId: filters.zoneId,
      segmentId: filters.segmentId,
    },
  };
}
