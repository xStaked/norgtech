/**
 * Serializa los searchParams de un server component a query string,
 * omitiendo undefined y repitiendo claves para valores multiples.
 */
export function buildQueryString(
  params: Record<string, string | string[] | undefined>,
): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined) return;
    if (Array.isArray(value)) {
      value.forEach((item) => query.append(key, item));
      return;
    }
    query.set(key, value);
  });
  return query.toString();
}
