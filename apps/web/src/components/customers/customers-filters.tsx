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
  const currentQuery = searchParams.toString();
  const urlSearch = searchParams.get("search") ?? "";
  const [search, setSearch] = useState(urlSearch);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Cola de query strings que este componente escribio y todavia no ha visto
  // llegar. router.replace sobre esta ruta no commitea hasta que vuelve el
  // payload RSC (3-4 fetch al API), asi que dentro de esa ventana la URL del
  // ultimo render esta vieja: dos escrituras seguidas se pisarian. Cada
  // escritura se apila sobre la anterior y su eco se consume en orden, lo que
  // ademas distingue nuestros propios ecos de una navegacion externa.
  const pendingRef = useRef<string[]>([]);
  // Ultima query string ya vista (se actualiza en el efecto, no en el render).
  const seenQueryRef = useRef(currentQuery);

  const commit = (query: string) => {
    const pending = pendingRef.current;
    // Base = lo ultimo que escribimos y sigue en vuelo, o la URL vigente.
    const base = pending.length > 0 ? pending[pending.length - 1] : seenQueryRef.current;
    // Mismo destino que el actual: no gastes un round-trip RSC.
    if (query === base) return;
    pending.push(query);
    router.replace(query ? `${pathname}?${query}` : pathname);
  };

  const setParam = (key: string, value: string) => {
    const pending = pendingRef.current;
    const base = pending.length > 0 ? pending[pending.length - 1] : seenQueryRef.current;
    const params = new URLSearchParams(base);
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    commit(params.toString());
  };

  const onSearchChange = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      setParam("search", value.trim());
    }, 300);
  };

  // Resincroniza el input cuando la URL cambia por fuera de este componente
  // (navegacion atras/adelante, o el Link del sidebar a esta misma ruta, que no
  // remonta el componente), ignorando el eco de nuestros propios commits.
  useEffect(() => {
    seenQueryRef.current = currentQuery;
    const pending = pendingRef.current;
    const echoIndex = pending.indexOf(currentQuery);
    if (echoIndex >= 0) {
      // Es nuestro eco: consume hasta el (Next puede fusionar navegaciones
      // seguidas y saltarse las intermedias) y no toques lo tecleado.
      pending.splice(0, echoIndex + 1);
      return;
    }
    // Navegacion externa: la cola ya no vale y el estado se resiembra de la URL.
    pending.length = 0;
    setSearch(new URLSearchParams(currentQuery).get("search") ?? "");
  }, [currentQuery]);

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
              setSearch("");
              commit("");
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
