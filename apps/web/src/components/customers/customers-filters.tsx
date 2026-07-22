"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FilterBar } from "@/components/ui/filter-bar";
import { Input } from "@/components/ui/input";
import { PAYMENT_LABELS } from "@/lib/labels";

interface Option {
  id: string;
  name: string;
}

interface CustomersFiltersProps {
  companies: Option[];
  segments: Option[];
  /** Filas visibles con los filtros aplicados. */
  shown: number;
  /** Total de clientes sin filtrar (para el resumen "N de M"). */
  total: number;
}

const selectClasses =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

const FILTER_KEYS = ["search", "companyId", "active", "segmentId", "paymentCondition"] as const;

export function CustomersFilters({ companies, segments, shown, total }: CustomersFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlSearch = searchParams.get("search") ?? "";
  const [search, setSearch] = useState(urlSearch);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;
  // Ultimo valor que este componente escribio en la URL. El router.replace del
  // debounce tarda un round-trip al server component en reflejarse; sin esta
  // marca, ese eco tardio llega como "cambio de URL" y el efecto de resync de
  // abajo pisa lo que el usuario siguio tecleando entre medias (comprobado:
  // tecleando "agropecuaria" quedaba "agrocuaria").
  const committedSearchRef = useRef(urlSearch);

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParamsRef.current.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.replace(params.size ? `${pathname}?${params.toString()}` : pathname);
  };

  const onSearchChange = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      committedSearchRef.current = value.trim();
      setParam("search", value.trim());
    }, 300);
  };

  // Resincroniza el input cuando la URL cambia por fuera de este componente
  // (navegacion atras/adelante), ignorando el eco de nuestros propios commits.
  useEffect(() => {
    if (urlSearch === committedSearchRef.current) return;
    committedSearchRef.current = urlSearch;
    setSearch(urlSearch);
  }, [urlSearch]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const hasFilters = FILTER_KEYS.some((key) => searchParams.get(key));
  const summary = hasFilters
    ? `${shown.toLocaleString("es-CO")} de ${total.toLocaleString("es-CO")} clientes`
    : `${total.toLocaleString("es-CO")} clientes registrados`;

  return (
    <FilterBar
      summary={summary}
      actions={
        hasFilters ? (
          <button
            type="button"
            onClick={() => {
              if (debounceRef.current) {
                clearTimeout(debounceRef.current);
                debounceRef.current = null;
              }
              committedSearchRef.current = "";
              setSearch("");
              router.replace(pathname);
            }}
            className="h-8 rounded-lg border border-input px-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Limpiar
          </button>
        ) : null
      }
    >
      <Input
        type="search"
        placeholder="Buscar por nombre, razón social o NIT"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        className="w-64"
        aria-label="Buscar clientes"
      />
      <select
        aria-label="Filtrar por empresa"
        className={selectClasses}
        value={searchParams.get("companyId") ?? ""}
        onChange={(event) => setParam("companyId", event.target.value)}
      >
        <option value="">Todas las empresas</option>
        {companies.map((company) => (
          <option key={company.id} value={company.id}>
            {company.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Filtrar por estado"
        className={selectClasses}
        value={searchParams.get("active") ?? ""}
        onChange={(event) => setParam("active", event.target.value)}
      >
        <option value="">Todos los estados</option>
        <option value="true">Activos</option>
        <option value="false">Inactivos</option>
      </select>
      <select
        aria-label="Filtrar por segmento"
        className={selectClasses}
        value={searchParams.get("segmentId") ?? ""}
        onChange={(event) => setParam("segmentId", event.target.value)}
      >
        <option value="">Todos los segmentos</option>
        {segments.map((segment) => (
          <option key={segment.id} value={segment.id}>
            {segment.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Filtrar por pago"
        className={selectClasses}
        value={searchParams.get("paymentCondition") ?? ""}
        onChange={(event) => setParam("paymentCondition", event.target.value)}
      >
        <option value="">Todas las formas de pago</option>
        {Object.entries(PAYMENT_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </FilterBar>
  );
}
