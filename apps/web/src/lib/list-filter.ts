/**
 * Filtrado en memoria para los listados que el API todavia entrega completos.
 * La URL manda: el server component lee searchParams y recorta las filas antes
 * de renderizar, y <ListFilters> solo escribe esos parametros.
 *
 * ponytail: filtra sobre el array ya cargado. Cuando un listado no quepa en una
 * sola respuesta, ese modulo pasa sus parametros al API (como /customers).
 */

export type SearchParams = Record<string, string | string[] | undefined>;

/** Primer valor de un parametro repetible, o undefined si viene vacio. */
export function param(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  const first = Array.isArray(value) ? value[0] : value;
  return first || undefined;
}

/** Sin tildes y en minusculas: "Cotizacion" encuentra "cotización". */
function normalize(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export interface FilterSpec<T> {
  /** Campos donde busca el texto libre de `search`. */
  search?: (row: T) => (string | null | undefined)[];
  /** Parametro de URL -> valor de la fila con el que se compara exacto. */
  match?: Record<string, (row: T) => string | null | undefined>;
}

export function applyFilters<T>(rows: T[], params: SearchParams, spec: FilterSpec<T>): T[] {
  const search = param(params, "search");
  const term = search ? normalize(search) : null;
  const matchers = Object.entries(spec.match ?? {})
    .map(([key, get]) => [param(params, key), get] as const)
    .filter((entry): entry is [string, (row: T) => string | null | undefined] => entry[0] !== undefined);

  if (!term && matchers.length === 0) return rows;

  return rows.filter((row) => {
    if (term && spec.search) {
      const haystack = spec.search(row).filter(Boolean) as string[];
      if (!haystack.some((field) => normalize(field).includes(term))) return false;
    }
    return matchers.every(([value, get]) => (get(row) ?? "") === value);
  });
}

/** Opciones de un select a partir de los valores presentes en las filas. */
export function optionsFrom<T>(rows: T[], get: (row: T) => string | null | undefined) {
  const values = [...new Set(rows.map(get).filter(Boolean) as string[])].sort((a, b) =>
    a.localeCompare(b, "es"),
  );
  return values.map((value) => ({ value, label: value }));
}
