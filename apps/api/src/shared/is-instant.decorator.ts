import { applyDecorators } from "@nestjs/common";
import { IsISO8601, Matches } from "class-validator";

/**
 * Exige una fecha-hora ISO 8601 CON offset explicito ("...Z" o "...-05:00").
 *
 * VIS-03: un `datetime-local` manda "2026-07-16T14:30", sin offset. `new Date()`
 * lo interpreta en la zona del SERVIDOR, asi que en un host UTC las 14:30 de
 * Colombia se guardaban como 14:30Z = 09:30 Colombia (el desfase de 5 horas que
 * reporto QA). `@IsISO8601()` por si solo acepta esa cadena ambigua, asi que el
 * offset se exige aparte: un instante sin offset no es un instante.
 */
const ISO_WITH_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/;

export function IsInstantString(): PropertyDecorator {
  return applyDecorators(
    IsISO8601({ strict: true }),
    Matches(ISO_WITH_OFFSET, {
      message:
        "$property debe incluir un offset horario explicito (por ejemplo 2026-07-16T14:30:00.000-05:00); " +
        "una hora local sin offset es ambigua",
    }),
  );
}
