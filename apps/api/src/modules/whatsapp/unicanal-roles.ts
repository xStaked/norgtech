import { UserRole } from "@prisma/client";

/** Roles que atienden el unicanal: reciben ruteo, bandeja y notificación. */
export const UNICANAL_AGENT_ROLES: readonly UserRole[] = [
  UserRole.comercial,
  UserRole.tecnico,
  UserRole.facturacion,
  UserRole.logistica,
];

/** Roles que solo supervisan: ven todo, no atienden, no reciben ruteo. */
export const UNICANAL_SUPERVISOR_ROLES: readonly UserRole[] = [
  UserRole.administrador,
  UserRole.director_comercial,
];

export function isSupervisor(role: UserRole): boolean {
  return UNICANAL_SUPERVISOR_ROLES.includes(role);
}

/** `true` si el string es un rol que puede atender el unicanal (valida el `rol` que manda Nora). */
export function isAttendableRole(value: string | null | undefined): value is UserRole {
  return value != null && (UNICANAL_AGENT_ROLES as readonly string[]).includes(value);
}
