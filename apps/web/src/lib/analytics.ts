import { apiFetch } from "@/lib/api.server";

/**
 * Cliente y formateo de las 4 pantallas de analitica (docs/analytics-spec.md).
 *
 * Las cuatro comparten filtros, envoltura de respuesta y formato de cifras: si
 * cada pantalla formateara por su cuenta, el mismo numero se veria distinto en
 * dos sitios.
 */

export const ANALYTICS_SCREENS = [
  { slug: "ventas", label: "Ventas", endpoint: "sales" },
  { slug: "cartera", label: "Cartera", endpoint: "receivables" },
  { slug: "embudo", label: "Embudo", endpoint: "funnel" },
  { slug: "comercial", label: "Desempeño", endpoint: "seller-performance" },
] as const;

export type AnalyticsSlug = (typeof ANALYTICS_SCREENS)[number]["slug"];

/** Params compartidos que la barra de filtros escribe en la URL (§2.1). */
export const FILTER_KEYS = [
  "from",
  "to",
  "asOf",
  "currency",
  "companyId",
  "sellerUserId",
  "zoneId",
  "segmentId",
  "granularity",
] as const;

export type SearchParams = Record<string, string | string[] | undefined>;

export function param(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  const single = Array.isArray(value) ? value[0] : value;
  return single && single.trim() ? single : undefined;
}

/** Query string del API a partir de los params de la URL, sin inventar valores. */
export function analyticsQuery(params: SearchParams): string {
  const query = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = param(params, key);
    if (value) query.set(key, value);
  }
  return query.toString();
}

export interface AnalyticsEnvelope {
  range: { from: string; to: string; granularity: "day" | "week" | "month" };
  currency: "COP" | "USD";
  filters: {
    companyId: string | null;
    sellerUserId: string | null;
    zoneId: string | null;
    segmentId: string | null;
  };
}

export async function fetchAnalytics<T extends AnalyticsEnvelope>(
  endpoint: string,
  params: SearchParams,
): Promise<T | null> {
  const query = analyticsQuery(params);
  const response = await apiFetch(`/analytics/${endpoint}${query ? `?${query}` : ""}`, {
    cache: "no-store",
  });
  if (!response.ok) return null;
  return (await response.json()) as T;
}

// --- opciones de la barra de filtros ---------------------------------------

export interface FilterOption {
  value: string;
  label: string;
}

export interface AnalyticsFilterOptions {
  companies: FilterOption[];
  sellers: FilterOption[];
  zones: FilterOption[];
  segments: FilterOption[];
}

async function options(
  path: string,
  toOption: (row: Record<string, unknown>) => FilterOption,
): Promise<FilterOption[]> {
  try {
    const response = await apiFetch(path, { cache: "no-store" });
    if (!response.ok) return [];
    const rows = (await response.json()) as Record<string, unknown>[];
    return Array.isArray(rows) ? rows.map(toOption) : [];
  } catch {
    // Un selector vacio degrada la barra de filtros, no tumba la pantalla.
    return [];
  }
}

export async function fetchFilterOptions(): Promise<AnalyticsFilterOptions> {
  const [companies, sellers, zones, segments] = await Promise.all([
    options("/companies", (row) => ({
      value: String(row.id),
      label: row.prefix ? `${row.name} (${row.prefix})` : String(row.name),
    })),
    options("/users/sellers", (row) => ({ value: String(row.id), label: String(row.name) })),
    options("/zones", (row) => ({ value: String(row.id), label: String(row.name) })),
    options("/customer-segments", (row) => ({ value: String(row.id), label: String(row.name) })),
  ]);
  return { companies, sellers, zones, segments };
}

// --- formato ---------------------------------------------------------------

const fullMoney = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const compactMoney = new Intl.NumberFormat("es-CO", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const decimal = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });
const dateFormat = new Intl.DateTimeFormat("es-CO", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "America/Bogota",
});

const SYMBOL: Record<string, string> = { COP: "$", USD: "US$" };

/** Cifra corta para tarjetas y tablas: millones abreviados, sin decimales sueltos. */
export function money(value: number, currency = "COP"): string {
  const symbol = SYMBOL[currency] ?? "";
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) {
    return `${value < 0 ? "−" : ""}${symbol}${compactMoney.format(absolute / 1_000_000)}M`;
  }
  return `${value < 0 ? "−" : ""}${symbol}${fullMoney.format(absolute)}`;
}

export function count(value: number): string {
  return value.toLocaleString("es-CO");
}

export function number(value: number): string {
  return decimal.format(value);
}

export function percent(value: number): string {
  return `${decimal.format(value)}%`;
}

export function signedPercent(value: number): string {
  return `${value > 0 ? "+" : ""}${decimal.format(value)}%`;
}

export function date(value: string | null): string {
  if (!value) return "—";
  return dateFormat.format(new Date(value));
}

/** `2026-07` / `2026-07-20` -> etiqueta corta del eje de la serie. */
export function bucketLabel(bucket: string, granularity: string): string {
  if (granularity === "month") {
    const [year, month] = bucket.split("-");
    const label = new Intl.DateTimeFormat("es-CO", { month: "short", timeZone: "UTC" }).format(
      new Date(Date.UTC(Number(year), Number(month) - 1, 1)),
    );
    return label.replace(".", "");
  }
  return dateFormat.format(new Date(`${bucket}T12:00:00.000Z`)).replace(/ de \d{4}$/, "");
}

/** Rango legible para la barra de filtros: "1 ene – 25 jul 2026". */
export function rangeLabel(from: string, to: string): string {
  return `${date(`${from}T12:00:00.000Z`)} – ${date(`${to}T12:00:00.000Z`)}`;
}

/** Semaforo compartido: verde bien, ambar atencion, rojo critico. */
export type Tone = "good" | "warn" | "bad" | "neutral";

export const TONE_BAR: Record<Tone, string> = {
  good: "bg-[#00a651]",
  warn: "bg-[#f58221]",
  bad: "bg-[#ee1c25]",
  neutral: "bg-[#0f5c8a]",
};

export const TONE_TEXT: Record<Tone, string> = {
  good: "text-[#167c4a]",
  warn: "text-[#9a6410]",
  bad: "text-[#b42318]",
  neutral: "text-foreground",
};

export const TONE_CHIP: Record<Tone, string> = {
  good: "bg-[#e6f4ec] text-[#167c4a]",
  warn: "bg-[#fdf0dc] text-[#9a6410]",
  bad: "bg-[#fcebe9] text-[#b42318]",
  neutral: "bg-muted text-muted-foreground",
};

/** Menos es mejor (descuento, costo sobre venta, mora). */
export function toneDescending(value: number, warn: number, bad: number): Tone {
  if (value >= bad) return "bad";
  if (value >= warn) return "warn";
  return "good";
}

/** Mas es mejor (cumplimiento de visitas, tasa de cierre). */
export function toneAscending(value: number, warn: number, good: number): Tone {
  if (value >= good) return "good";
  if (value >= warn) return "warn";
  return "bad";
}
