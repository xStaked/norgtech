/**
 * Fechas y horas del CRM (VIS-03).
 *
 * Las columnas del API son TIMESTAMP(3) sin zona, asi que la unica defensa
 * contra el desfase de 5 horas que reporto QA es codigo explicito:
 *
 * - Al ESCRIBIR: un `<input type="datetime-local">` produce "2026-07-16T14:30",
 *   sin offset. Enviar esa cadena tal cual deja que el SERVIDOR decida la zona
 *   (en un host UTC, las 14:30 de Colombia se guardaban como 09:30 Colombia).
 *   `toInstantString` la convierte en un instante real antes de mandarla.
 * - Al LEER: un formateador sin `timeZone` usa la zona del proceso, asi que el
 *   render del servidor (SSR) y el del navegador pueden discrepar e hidratar
 *   distinto. Los formateadores de aqui fijan la zona siempre.
 */
export const BOGOTA_TIME_ZONE = "America/Bogota";

/**
 * Convierte el valor de un `<input type="datetime-local">` ("2026-07-16T14:30")
 * en un ISO con offset explicito, interpretandolo en la zona del navegador
 * (la hora de pared que el usuario acaba de teclear).
 */
export function toInstantString(localValue: string): string {
  return new Date(localValue).toISOString();
}

/** Valor para un `<input type="datetime-local">` a partir de un instante. */
export function toDateTimeLocalValue(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

export const dateTimeFormatter = new Intl.DateTimeFormat("es-CO", {
  timeZone: BOGOTA_TIME_ZONE,
  dateStyle: "medium",
  timeStyle: "short",
});

export const shortDateTimeFormatter = new Intl.DateTimeFormat("es-CO", {
  timeZone: BOGOTA_TIME_ZONE,
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export const dateFormatter = new Intl.DateTimeFormat("es-CO", {
  timeZone: BOGOTA_TIME_ZONE,
  dateStyle: "medium",
});

const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BOGOTA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Dia natural ("2026-07-16") de un instante en Bogota. */
export function dayKeyInBogota(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return dayKeyFormatter.format(date);
}

/** True si ambos instantes caen el mismo dia natural en Bogota. */
export function isSameDayInBogota(left: string | Date, right: string | Date): boolean {
  return dayKeyInBogota(left) === dayKeyInBogota(right);
}
