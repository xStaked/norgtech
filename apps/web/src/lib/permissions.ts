// El tipo UserRole debe mantenerse alineado con apps/api/src/modules/auth/permissions.ts.
// Los ROLE_GROUPS son propios del consumidor web y difieren del API a propósito
// (aquí promotor acompaña permisos de nivel admin).

export type UserRole =
  | "administrador"
  | "promotor"
  | "director_comercial"
  | "comercial"
  | "tecnico"
  | "facturacion"
  | "logistica";

export const ROLE_GROUPS = {
  COMMERCIAL_WRITERS: ["administrador", "promotor", "director_comercial", "comercial"],
  FIELD_OPS: ["administrador", "promotor", "director_comercial", "comercial", "tecnico"],
  BILLING: ["administrador", "promotor", "director_comercial", "facturacion"],
  RETURNS_WRITERS: ["administrador", "promotor", "director_comercial", "facturacion", "comercial"],
  LOGISTICS: ["administrador", "promotor", "logistica"],
  ADMIN_AND_DIRECTOR: ["administrador", "promotor", "director_comercial"], // Empresas y Zonas (RBAC-01)
  ADMIN_ONLY: ["administrador"],
} as const satisfies Record<string, readonly UserRole[]>;
