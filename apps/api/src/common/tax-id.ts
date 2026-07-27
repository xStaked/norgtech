/**
 * El NIT se guarda como lo trajo el Excel ("900923429-1" o solo la base), pero
 * la gente lo escribe con puntos ("9.009.234.291") o pegado. Sin normalizar la
 * busqueda, buscar el NIT real no encuentra al cliente y despues crearlo
 * revienta contra el indice unico con "ya existe": el usuario ve una
 * contradiccion.
 *
 * Devuelve las variantes extra a buscar con `contains` sobre taxId. Solo
 * normaliza el termino de busqueda; lo guardado no se toca.
 */
export function taxIdSearchVariants(search: string): string[] {
  const compact = search.replace(/[^a-zA-Z0-9]/g, "");
  if (compact.length < 8) return [];
  // Con el digito de verificacion pegado, la base es lo que matchea "base-dv".
  const variants = compact.length > 8 ? [compact, compact.slice(0, -1)] : [compact];
  return variants.filter((v) => v !== search);
}
