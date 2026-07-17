import { applyDecorators } from "@nestjs/common";
import { IsISO8601 } from "class-validator";

/**
 * Exige una fecha-hora ISO 8601. El offset es OPCIONAL: si no viene, se
 * interpreta como hora de pared en Colombia (ver `parseInstant`).
 *
 * VIS-03 no era "falta el offset" sino "sin offset, `new Date()` usa la zona del
 * SERVIDOR": en un host UTC las 14:30 de Colombia quedaban como 09:30. El fix
 * vive en `parseInstant`, que fija la zona explicitamente.
 *
 * Exigir el offset aqui parecia mas limpio, pero rompia produccion: Nora
 * (agents/nora/src/tools/visits.py) postea a /visits con el `scheduled_at` que
 * produce el LLM — sin offset — y habria recibido 400 en cada visita creada por
 * WhatsApp.
 */
export function IsInstantString(): PropertyDecorator {
  return applyDecorators(IsISO8601({ strict: true }));
}
