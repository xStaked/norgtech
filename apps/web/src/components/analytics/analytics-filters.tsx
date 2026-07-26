"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Calendar, Info } from "lucide-react";
import type { AnalyticsFilterOptions, FilterOption } from "@/lib/analytics";
import { Select } from "@/components/ui/select";

/**
 * Barra de filtros COMPARTIDA por las 4 pantallas (docs/analytics-spec.md §2.1).
 *
 * Escribe en la URL y deja que el server component vuelva a pedir: no hay
 * estado duplicado ni fetch en cliente. Los valores que pinta son los que el
 * back dice haber APLICADO, no los que el usuario pidio — para un comercial el
 * vendedor viene forzado y la barra tiene que reflejarlo.
 */

interface AnalyticsFiltersProps {
  options: AnalyticsFilterOptions;
  currency: "COP" | "USD";
  applied: {
    companyId: string | null;
    sellerUserId: string | null;
    zoneId: string | null;
    segmentId: string | null;
  };
  /** Ventas usa rango + granularidad; cartera usa una sola fecha de corte. */
  mode: "range" | "asOf";
  range: { from: string; to: string; granularity: string };
  asOf?: string;
  note: string;
}

const GRANULARITIES = [
  { value: "day", label: "Día" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
];

export function AnalyticsFilters({
  options,
  currency,
  applied,
  mode,
  range,
  asOf,
  note,
}: AnalyticsFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setParams = (entries: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(entries)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };

  const select = (
    key: string,
    allLabel: string,
    items: FilterOption[],
    value: string | null,
  ) => (
    <Select
      key={key}
      aria-label={allLabel}
      className="w-auto min-w-40 max-w-64 bg-card font-semibold"
      searchPlaceholder={allLabel}
      value={value ?? ""}
      onValueChange={(next) => setParams({ [key]: next })}
      disabled={items.length === 0}
      options={[{ value: "", label: allLabel }, ...items]}
    />
  );

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-border bg-card px-3 py-2.5">
      {mode === "range" ? (
        <div className="flex items-center gap-2 rounded-lg border border-input bg-card px-2.5 py-1">
          <Calendar className="h-[15px] w-[15px] text-primary" aria-hidden="true" />
          <input
            type="date"
            aria-label="Desde"
            className="bg-transparent text-[12.5px] font-semibold tabular-nums outline-none"
            value={range.from}
            max={range.to}
            onChange={(event) => setParams({ from: event.target.value })}
          />
          <span className="text-muted-foreground">–</span>
          <input
            type="date"
            aria-label="Hasta"
            className="bg-transparent text-[12.5px] font-semibold tabular-nums outline-none"
            value={range.to}
            min={range.from}
            onChange={(event) => setParams({ to: event.target.value })}
          />
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-primary bg-card px-2.5 py-1 ring-[3px] ring-primary/10">
          <Calendar className="h-[15px] w-[15px] text-primary" aria-hidden="true" />
          <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
            Al
          </span>
          <input
            type="date"
            aria-label="Fecha de corte"
            className="bg-transparent text-[12.5px] font-semibold tabular-nums outline-none"
            value={asOf ?? range.to}
            onChange={(event) => setParams({ asOf: event.target.value })}
          />
        </div>
      )}

      {mode === "range" ? (
        <div className="inline-flex overflow-hidden rounded-lg border border-input bg-muted">
          {GRANULARITIES.map((item, index) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setParams({ granularity: item.value })}
              className={`px-3 py-1.5 text-[12px] ${index > 0 ? "border-l border-input" : ""} ${
                range.granularity === item.value
                  ? "bg-card font-bold text-foreground shadow-[inset_0_-2px_0_var(--primary)]"
                  : "font-semibold text-muted-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      <span className="h-6 w-px bg-border" aria-hidden="true" />

      {/* La moneda no es un detalle: no hay tabla de tasas, asi que COP y USD
          nunca se suman. Por eso vive en la barra, no escondida en un menu. */}
      <div className="inline-flex overflow-hidden rounded-lg border border-input bg-muted">
        {(["COP", "USD"] as const).map((code, index) => (
          <button
            key={code}
            type="button"
            onClick={() => setParams({ currency: code })}
            className={`px-3 py-1.5 text-[12px] ${index > 0 ? "border-l border-input" : ""} ${
              currency === code
                ? "bg-card font-bold text-primary shadow-[inset_0_-2px_0_var(--primary)]"
                : "font-semibold text-muted-foreground"
            }`}
          >
            {code}
          </button>
        ))}
      </div>

      {select("companyId", "Empresa: todas", options.companies, applied.companyId)}
      {select("sellerUserId", "Vendedor: todos", options.sellers, applied.sellerUserId)}
      {select("zoneId", "Zona: todas", options.zones, applied.zoneId)}
      {select("segmentId", "Segmento: todos", options.segments, applied.segmentId)}

      <span className="ml-auto flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
        {note}
      </span>
    </div>
  );
}
