// Debe mantenerse en sync con apps/api/src/modules/auth/permissions.ts

export type UserRole =
  | "administrador"
  | "director_comercial"
  | "comercial"
  | "tecnico"
  | "facturacion"
  | "logistica";

export const ROLE_GROUPS = {
  COMMERCIAL_WRITERS: ["administrador", "director_comercial", "comercial"],
  FIELD_OPS: ["administrador", "director_comercial", "comercial", "tecnico"],
  BILLING: ["administrador", "director_comercial", "facturacion"],
  RETURNS_WRITERS: ["administrador", "director_comercial", "facturacion", "comercial"],
  LOGISTICS: ["administrador", "logistica"],
  ADMIN_AND_DIRECTOR: ["administrador", "director_comercial"], // Empresas y Zonas (RBAC-01)
  ADMIN_ONLY: ["administrador"],
} as const satisfies Record<string, readonly UserRole[]>;
