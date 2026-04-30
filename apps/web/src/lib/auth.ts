export const SESSION_COOKIE_NAME = "session_token";

export type UserRole =
  | "administrador"
  | "director_comercial"
  | "comercial"
  | "tecnico"
  | "facturacion"
  | "logistica";

export const USER_ROLES: readonly UserRole[] = [
  "administrador",
  "director_comercial",
  "comercial",
  "tecnico",
  "facturacion",
  "logistica",
];

export function getSessionTokenClient(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${SESSION_COOKIE_NAME}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function getUserRoleFromToken(token: string | null): UserRole | null {
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  const role = payload?.role;
  if (typeof role === "string" && USER_ROLES.includes(role as UserRole)) {
    return role as UserRole;
  }
  return null;
}

export function canAccess(role: UserRole | null, moduleHref: string): boolean {
  if (!role) return false;

  const moduleAccess: Record<string, readonly UserRole[]> = {
    "/dashboard": ["administrador", "director_comercial", "comercial", "tecnico", "facturacion", "logistica"],
    "/agenda": ["administrador", "director_comercial", "comercial", "tecnico"],
    "/visits": ["administrador", "director_comercial", "comercial", "tecnico"],
    "/follow-ups": ["administrador", "director_comercial", "comercial", "tecnico"],
    "/customers": ["administrador", "director_comercial", "comercial", "tecnico", "facturacion", "logistica"],
    "/opportunities": ["administrador", "director_comercial", "comercial"],
    "/quotes": ["administrador", "director_comercial", "comercial", "facturacion"],
    "/orders": ["administrador", "director_comercial", "comercial", "facturacion", "logistica"],
    "/billing-requests": ["administrador", "director_comercial", "facturacion"],
    "/products": ["administrador", "director_comercial", "comercial"],
    "/segments": ["administrador", "director_comercial", "comercial"],
  };

  const allowedRoles = moduleAccess[moduleHref];
  if (!allowedRoles) return false;
  return allowedRoles.includes(role);
}
