import { BadRequestException } from "@nestjs/common";

/**
 * Colombia no tiene horario de verano: su offset es -05:00 todo el año, asi que
 * basta una constante. Si algun dia el negocio opera en una zona CON DST, esto
 * tiene que pasar a calcular el offset por fecha (Intl con timeZone).
 */
export const BOGOTA_OFFSET = "-05:00";

const HAS_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/;
const LOOKS_LIKE_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;

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
