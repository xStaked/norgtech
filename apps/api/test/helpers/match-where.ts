/**
 * Matcher de `where` para los stubs de PrismaService.
 *
 * Un stub que ignore claves desconocidas del `where` hace que un filtro nuevo
 * PAREZCA funcionar mientras no filtra nada (los tests pasan por la razon
 * equivocada). Por eso este matcher LANZA ante cualquier operador que no
 * entienda: si el servicio empieza a mandar un `where` que el stub no sabe
 * evaluar, el test explota en vez de mentir.
 */

function toTime(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" || typeof value === "number") {
    return new Date(value).getTime();
  }
  throw new Error(`matchesWhere: valor no comparable como fecha: ${String(value)}`);
}

function isDateLike(value: unknown): boolean {
  return value instanceof Date || typeof value === "string" || typeof value === "number";
}

function compare(op: string, value: unknown, operand: unknown, key: string): boolean {
  switch (op) {
    case "equals":
      return value === operand;
    case "not":
      return value !== operand;
    case "in":
      return (operand as unknown[]).includes(value);
    case "notIn":
      return !(operand as unknown[]).includes(value);
    case "lt":
      return toTime(value) < toTime(operand);
    case "lte":
      return toTime(value) <= toTime(operand);
    case "gt":
      return toTime(value) > toTime(operand);
    case "gte":
      return toTime(value) >= toTime(operand);
    default:
      throw new Error(
        `matchesWhere: operador no soportado "${op}" en la clave "${key}". ` +
          `Ensena el operador al stub en vez de dejar que el filtro se ignore en silencio.`,
      );
  }
}

export function matchesWhere(
  row: Record<string, unknown>,
  where?: Record<string, unknown>,
): boolean {
  if (!where) return true;

  for (const [key, condition] of Object.entries(where)) {
    if (condition === undefined) continue;

    if (key === "AND" || key === "OR" || key === "NOT") {
      const clauses = (Array.isArray(condition) ? condition : [condition]) as Array<
        Record<string, unknown>
      >;
      if (key === "AND" && !clauses.every((c) => matchesWhere(row, c))) return false;
      if (key === "OR" && !clauses.some((c) => matchesWhere(row, c))) return false;
      if (key === "NOT" && clauses.some((c) => matchesWhere(row, c))) return false;
      continue;
    }

    if (!(key in row)) {
      throw new Error(
        `matchesWhere: la fila no tiene la clave "${key}" que el where exige. ` +
          `Anade el campo a la fixture o corrige el filtro.`,
      );
    }

    const value = row[key];

    // Valor escalar => igualdad directa. Las fechas se comparan por instante.
    if (condition === null || typeof condition !== "object" || condition instanceof Date) {
      if (condition instanceof Date && isDateLike(value)) {
        if (toTime(value) !== toTime(condition)) return false;
        continue;
      }
      if (value !== condition) return false;
      continue;
    }

    for (const [op, operand] of Object.entries(condition as Record<string, unknown>)) {
      if (!compare(op, value, operand, key)) return false;
    }
  }

  return true;
}
