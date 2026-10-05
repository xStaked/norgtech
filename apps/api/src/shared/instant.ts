import { BadRequestException } from "@nestjs/common";

/**
 * Colombia no tiene horario de verano: su offset es -05:00 todo el año, asi que
 * basta una constante. Si algun dia el negocio opera en una zona CON DST, esto
 * tiene que pasar a calcular el offset por fecha (Intl con timeZone).
 */
export const BOGOTA_OFFSET = "-05:00";

const HAS_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/;
const LOOKS_LIKE_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;

/** Milisegundos de BOGOTA_OFFSET ("-05:00" -> -18_000_000). Derivado de la
 * constante para no duplicar el -5: si BOGOTA_OFFSET deja de matchear el
 * formato, el offset cae a 0 y el wall time = UTC. */
const BOGOTA_OFFSET_MS = (() => {
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(BOGOTA_OFFSET);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 3600 + Number(match[3]) * 60) * 1000;
})();

/**
 * Instancia "virtual" con los campos UTC de la hora de pared de Bogota: leer
 * getUTCFullYear/getUTCMonth/getUTCDate sobre este valor equivale a leer la
 * fecha en Colombia. Sirve para derivar buckets de periodo (mes/trimestre/anio)
 * con el mismo criterio de fronteras que `dayBoundary` (BOGOTA_OFFSET):
 * 2026-07-01T02:00Z son las 21:00 del 30 de junio en Bogota -> junio.
 */
export function bogotaWallTime(date: Date): Date {
  return new Date(date.getTime() + BOGOTA_OFFSET_MS);
}

/**
 * Convierte una fecha-hora del cliente en un instante.
 *
 * VIS-03: una cadena SIN offset ("2026-07-16T14:30") la interpretaba
 * `new Date()` en la zona del SERVIDOR. En un host UTC, las 14:30 de Colombia
 * se guardaban como 14:30Z = 09:30 Colombia — el desfase de 5 horas que reporto
 * el QA, y que ademas hacia que el valor guardado dependiera de donde corriera
 * el proceso.
 *
 * Aqui una cadena sin offset NO es ambigua: significa hora de pared en Colombia,
 * que es lo que quieren decir tanto el `datetime-local` del navegador como Nora
 * (agents/nora/src/tools/visits.py postea el `scheduled_at` que produce el LLM,
 * sin offset). Exigir el offset habria roto la creacion de visitas por WhatsApp.
 */
/**
 * Normaliza a una cadena con offset explicito, SIN construir un Date.
 *
 * Existe separado a proposito: es una funcion pura de string a string, asi que
 * se puede testear sin depender de la zona del proceso. Probar solo
 * `parseInstant` es una trampa — en una maquina que ya corre en America/Bogota
 * el resultado es identico con y sin el fix, y el test pasa aunque el bug este
 * vivo (solo falla en un host UTC, o sea en produccion).
 */
export function toInstantIso(value: string): string {
  const raw = value.trim();
  if (HAS_OFFSET.test(raw)) return raw;
  return LOOKS_LIKE_DATETIME.test(raw) ? `${raw}${BOGOTA_OFFSET}` : raw;
}

export function parseInstant(value: string): Date {
  const parsed = new Date(toInstantIso(value));
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`Fecha invalida: ${value}`);
  }
  return parsed;
}
