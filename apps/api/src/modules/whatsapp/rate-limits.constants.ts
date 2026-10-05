/**
 * Límites de tasa por endpoint (Ruling 3): el límite global de ThrottlerModule
 * (100/min) no cambia; estos son límites finos para los endpoints que tocan
 * recursos caros (LLM, OCR, CSV, PDF) y se activan desde Task 3.
 *
 * `ttl` está en MILLISECONDS (@nestjs/throttler ≥5) y `limit` es el número de
 * requests por ventana. Valores generosos por diseño: cortar un flujo real
 * sería peor que un burst razonable.
 */
export const RATE_LIMITS = {
  /** Turnos del agente Magali (LLM): cada turno es una llamada al modelo. */
  noraAgent: { ttl: 60_000, limit: 30 },
  /** OCR/extracción de gastos: CPU + modelo de visión por documento. */
  expenseOcr: { ttl: 60_000, limit: 12 },
  /** Exportaciones CSV de analítica: queries pesadas y builds en memoria. */
  analyticsCsv: { ttl: 60_000, limit: 10 },
  /** Reportes PDF: render costoso por request. */
  reportsPdf: { ttl: 60_000, limit: 10 },
} as const;

export type RateLimitKey = keyof typeof RATE_LIMITS;
export type RateLimitEntry = (typeof RATE_LIMITS)[RateLimitKey];
