/**
 * Catálogo y precios. El precio no cuelga del producto: cuelga del par
 * (presentación, lista). Ver docs/catalogo-front-spec.md.
 */

export interface PriceListRef {
  id: string;
  name: string;
  kind: "segmento" | "cliente" | "export" | "linea";
  currency: string;
  country: string | null;
  /** Clientes enganchados. Una lista `cliente` sin ninguno es un estado inválido. */
  customers?: { id: string; displayName: string; currency: string; country: string | null }[];
}

export const PRICE_LIST_KIND_LABEL: Record<PriceListRef["kind"], string> = {
  cliente: "Clientes",
  segmento: "Segmentos",
  export: "Países",
  linea: "Líneas de producto",
};

/**
 * A quién pertenece la lista, tal como debe verse en pantalla. Para las de
 * cliente es el nombre del cliente real, no el de la hoja del Excel: mostrar
 * "NANONUTRICION · cliente" cuando no existe tal cliente es lo que hacía
 * parecer que había compradores inventados.
 */
export function priceListOwner(list: PriceListRef): string {
  if (list.kind !== "cliente") return list.name;
  const customer = list.customers?.[0];
  return customer ? customer.displayName : `${list.name} — sin cliente asignado`;
}

/** Moneda y país salen de la lista (y para las de cliente, del cliente). */
export function priceListContext(list: PriceListRef): string {
  const customer = list.kind === "cliente" ? list.customers?.[0] : undefined;
  const currency = customer?.currency ?? list.currency;
  const country = customer?.country ?? list.country;
  return country ? `${currency} · ${country}` : currency;
}

export interface PriceCell {
  id: string;
  priceListId: string;
  priceListName: string;
  kind: PriceListRef["kind"];
  currency: string;
  country: string | null;
  priceSinIva: string | null;
  priceConIva: string | null;
  taxPercent: string | null;
  priceSinIva2: string | null;
  priceConIva2: string | null;
  priceSinIva3: string | null;
  priceConIva3: string | null;
}

export interface Presentation {
  id: string;
  empaque: string;
  form: string | null;
  dosage: string | null;
  active: boolean;
  prices: PriceCell[];
}

export interface ProductDetail {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  active: boolean;
  presentations: Presentation[];
  priceLists: PriceListRef[];
}

/**
 * COP y USD nunca se convierten ni se mezclan: no hay tasa de cambio en el
 * sistema. El símbolo tiene que dejar obvio cuál es cuál.
 */
export function formatPrice(
  value: string | number | null,
  currency: string,
  /** En listados los centavos de COP solo alargan la cifra: se redondea al peso. */
  round = false,
): string {
  if (value === null || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  const decimals = round && currency !== "USD" ? 0 : 2;
  const amount = n.toLocaleString("es-CO", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return currency === "USD" ? `US$ ${amount}` : `$${amount}`;
}

export function formatTax(taxPercent: string | null): string {
  if (taxPercent === null) return "—";
  const n = Number(taxPercent);
  return Number.isFinite(n) ? `${n}%` : "—";
}

export interface PriceLevel {
  label: string;
  sinIva: string | null;
  conIva: string | null;
}

/**
 * Niveles de precio de una celda. Casi todas las listas traen solo el 1;
 * algunas un 2 y AVSA un 3. Sin nombre comercial confirmado con el cliente,
 * así que se numeran y punto.
 */
export function priceLevels(cell: PriceCell): PriceLevel[] {
  return [
    { label: "Nivel 1", sinIva: cell.priceSinIva, conIva: cell.priceConIva },
    { label: "Nivel 2", sinIva: cell.priceSinIva2, conIva: cell.priceConIva2 },
    { label: "Nivel 3", sinIva: cell.priceSinIva3, conIva: cell.priceConIva3 },
  ].filter((level) => level.sinIva !== null || level.conIva !== null);
}

/** Nº de niveles extra, para el indicador discreto de la celda ("+2"). */
export function extraLevelCount(cell: PriceCell): number {
  return Math.max(0, priceLevels(cell).length - 1);
}

export interface PriceListOption {
  value: string;
  label: string;
  meta?: string;
  group?: string;
  disabled?: boolean;
}

/**
 * Opciones agrupadas para el selector de cliente. Usa el dueño real
 * (no la hoja del Excel) y bloquea las listas `cliente` huérfanas:
 * elegirlas cotizaría con una lista que no pertenece a nadie.
 */
export function buildPriceListOptions(lists: PriceListRef[]): PriceListOption[] {
  const kindOrder: Record<PriceListRef["kind"], number> = {
    segmento: 0,
    export: 1,
    linea: 2,
    cliente: 3,
  };
  const sorted = [...lists].sort(
    (a, b) => kindOrder[a.kind] - kindOrder[b.kind] || priceListOwner(a).localeCompare(priceListOwner(b)),
  );
  const options: PriceListOption[] = [
    {
      value: "",
      label: "Sin asignar — usa precio base",
      meta: "Cotiza a precio base del producto",
    },
  ];
  for (const list of sorted) {
    const orphan = list.kind === "cliente" && (!list.customers || list.customers.length === 0);
    options.push({
      value: list.id,
      label: priceListOwner(list),
      meta: priceListContext(list),
      group: PRICE_LIST_KIND_LABEL[list.kind],
      ...(orphan ? { disabled: true } : {}),
    });
  }
  return options;
}

export interface SuggestInput {
  country?: string | null;
  customerType?: string | null;
  currentPriceListId?: string | null;
}

/**
 * Sugiere lista sin pisar nunca una asignación manual válida.
 * Prioridad: 1) export por país, 2) segmento por tipo de cliente.
 */
export function suggestPriceList(
  lists: PriceListRef[],
  input: SuggestInput,
): PriceListRef | undefined {
  if (input.currentPriceListId) {
    const current = lists.find((l) => l.id === input.currentPriceListId);
    if (current) {
      if (current.kind === "cliente") {
        // Lista de cliente válida ya asignada: no sugerir encima.
        // Huérfana (sin clientes): seguir y sugerir corrección.
        if ((current.customers?.length ?? 0) > 0) return undefined;
      } else {
        // Ya tiene segmento/export/línea: no sugerir encima.
        return undefined;
      }
    }
    // Sin current (id desconocido) o huérfana: seguir a sugerencia.
  }

  const country = (input.country ?? "").trim().toLowerCase();
  if (country) {
    const byCountry = lists.find(
      (l) =>
        l.kind === "export" && (l.country ?? "").trim().toLowerCase() === country,
    );
    if (byCountry) return byCountry;
  }

  const type = (input.customerType ?? "").trim().toLowerCase();
  const byName = (name: string) =>
    lists.find((l) => l.name.trim().toUpperCase() === name);
  if (type === "distribuidor") {
    return byName("DISTRIBUIDORES") ?? lists.find((l) => l.kind === "segmento");
  }
  // Default nacional: DIRECTOS (directo, planta, maquila, otro o vacío).
  return byName("DIRECTOS") ?? lists.find((l) => l.kind === "segmento");
}
