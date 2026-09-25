import { Prisma } from "@prisma/client";

/**
 * Snapshot JSON-safe de un registro para los campos Json de AuditLog.
 * Misma semántica que JSON.parse(JSON.stringify(x)) (fechas -> string,
 * undefined -> omitido), pero tipado para no filtrar `any`.
 */
export function auditState(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
