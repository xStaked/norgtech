import { UserRole } from "@prisma/client";

export const ROLE_GROUPS = {
  COMMERCIAL_WRITERS: [UserRole.administrador, UserRole.director_comercial, UserRole.comercial],
  FIELD_OPS: [UserRole.administrador, UserRole.director_comercial, UserRole.comercial, UserRole.tecnico],
  BILLING: [UserRole.administrador, UserRole.director_comercial, UserRole.facturacion],
  RETURNS_WRITERS: [UserRole.administrador, UserRole.director_comercial, UserRole.facturacion, UserRole.comercial],
  LOGISTICS: [UserRole.administrador, UserRole.logistica],
  // Plan rol-promotor: promotor gestiona empresas y zonas
  // como admin (RBAC-01 ampliado).
  ADMIN_AND_DIRECTOR: [
    UserRole.administrador,
    UserRole.director_comercial,
    UserRole.promotor,
  ], // Empresas y Zonas (RBAC-01)
  ADMIN_ONLY: [UserRole.administrador],
} as const;
