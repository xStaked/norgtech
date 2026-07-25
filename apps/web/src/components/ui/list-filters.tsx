"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FilterBar } from "@/components/ui/filter-bar";
import { Input } from "@/components/ui/input";

export interface FilterSelect {
  /** Parametro de URL que escribe este select. */
  key: string;
  /** Texto de la opcion vacia: "Todos los estados". */
  allLabel: string;
  options: { value: string; label: string }[];
}

interface ListFiltersProps {
  searchPlaceholder?: string;
  selects?: FilterSelect[];
  /** Filas visibles con los filtros aplicados. */
  shown: number;
  /**
   * Total sin filtrar, para el resumen "N de M". Se omite cuando el listado ya
   * llega filtrado del API y no hay un total con el que comparar.
   */
  total?: number;
  /** Plural del recurso: "productos", "cotizaciones". */
  noun: string;
  /** Texto extra del resumen (totales de dinero, saldos). */
  summaryExtra?: ReactNode;
  actions?: ReactNode;
}

const selectClasses =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function ListFilters({
  searchPlaceholder,
  selects = [],
  shown,
  total,
  noun,
  summaryExtra,
  actions,
}: ListFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentQuery = searchParams.toString();
  const urlSearch = searchParams.get("search") ?? "";
  const [search, setSearch] = useState(urlSearch);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Cola de query strings que este componente escribio y todavia no ha visto
  // llegar. router.replace sobre esta ruta no commitea hasta que vuelve el
  // payload RSC, asi que dentro de esa ventana la URL del ultimo render esta
  // vieja: dos escrituras seguidas se pisarian. Cada escritura se apila sobre
  // la anterior y su eco se consume en orden, lo que ademas distingue nuestros
  // propios ecos de una navegacion externa.
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

  const keys = searchPlaceholder ? ["search", ...selects.map((s) => s.key)] : selects.map((s) => s.key);
  const hasFilters = keys.some((key) => searchParams.get(key));
  const count =
    total === undefined
      ? `${shown.toLocaleString("es-CO")} ${noun}`
      : hasFilters
        ? `${shown.toLocaleString("es-CO")} de ${total.toLocaleString("es-CO")} ${noun}`
        : `${total.toLocaleString("es-CO")} ${noun}`;

  return (
    <FilterBar
      summary={
        summaryExtra ? (
          <>
            {count} · {summaryExtra}
          </>
        ) : (
          count
        )
      }
      actions={
        <>
          {hasFilters ? (
            <button
              type="button"
              onClick={() => {
                if (debounceRef.current) {
                  clearTimeout(debounceRef.current);
                  debounceRef.current = null;
                }
                setSearch("");
                // Conserva los parametros que no son filtros de esta barra.
                const pending = pendingRef.current;
                const base =
                  pending.length > 0 ? pending[pending.length - 1] : seenQueryRef.current;
                const params = new URLSearchParams(base);
                keys.forEach((key) => params.delete(key));
                commit(params.toString());
              }}
              className="h-8 rounded-lg border border-input px-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Limpiar
            </button>
          ) : null}
          {actions}
        </>
      }
    >
      {searchPlaceholder ? (
        <Input
          type="search"
          placeholder={searchPlaceholder}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          className="w-64"
          aria-label={searchPlaceholder}
        />
      ) : null}
      {selects.map((select) => (
        <select
          key={select.key}
          aria-label={select.allLabel}
          className={selectClasses}
          value={searchParams.get(select.key) ?? ""}
          onChange={(event) => setParam(select.key, event.target.value)}
        >
          <option value="">{select.allLabel}</option>
          {select.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ))}
    </FilterBar>
  );
}
