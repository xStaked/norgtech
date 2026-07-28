export const SESSION_COOKIE_NAME = "session_token";

// Pantalla puente que renueva la sesion desde el navegador. Vive fuera de
// `(app)`, asi que no monta el AppShell y no vuelve a llamar a la API.
export const SESSION_REFRESH_PATH = "/session/refresh";

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

export const ROLE_LABELS: Record<UserRole, string> = {
  administrador: "Administrador",
  director_comercial: "Director comercial",
  comercial: "Comercial",
  tecnico: "Técnico",
  facturacion: "Facturación",
  logistica: "Logística",
};

export function getSessionTokenClient(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${SESSION_COOKIE_NAME}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function setSessionTokenClient(token: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; path=/; SameSite=Lax`;
}

export function clearSessionClient(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${SESSION_COOKIE_NAME}=; path=/; Max-Age=0`;
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

/**
 * El access token dura 15m (`expiresIn` en apps/api auth.service.ts). Decodificar
 * el rol no alcanza: un token vencido decodifica igual y la request sigue viva,
 * pero la API responde 401 y la pantalla renderiza vacia. Todo lo que decida si
 * la sesion sirve tiene que mirar `exp`.
 *
 * El margen evita el caso borde de un token que pasa el chequeo y vence entre
 * el middleware y la llamada a la API.
 */
export function isTokenExpired(token: string | null, skewSeconds = 30): boolean {
  if (!token) return true;
  const exp = decodeJwtPayload(token)?.exp;
  // Sin `exp` legible no hay forma de confiar en el token: se trata como vencido.
  if (typeof exp !== "number") return true;
  return exp * 1000 <= Date.now() + skewSeconds * 1000;
}

/**
 * Solo rutas internas: `//evil.com` y `https://…` en `?next=` serian un
 * redirect abierto desde una pantalla de sesion.
 */
export function sanitizeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}

export function buildSessionRefreshUrl(next: string): string {
  return `${SESSION_REFRESH_PATH}?next=${encodeURIComponent(sanitizeNextPath(next))}`;
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
    "/whatsapp": ["administrador", "director_comercial", "comercial", "tecnico", "facturacion", "logistica"],
    "/nora": ["administrador", "director_comercial", "comercial", "tecnico"],
    "/visits": ["administrador", "director_comercial", "comercial", "tecnico"],
    "/expenses": ["administrador", "director_comercial", "comercial", "facturacion"],
    "/follow-ups": ["administrador", "director_comercial", "comercial", "tecnico"],
    "/customers": ["administrador", "director_comercial", "comercial", "tecnico", "facturacion", "logistica"],
    "/opportunities": ["administrador", "director_comercial", "comercial"],
    "/quotes": ["administrador", "director_comercial", "comercial", "facturacion"],
    "/orders": ["administrador", "director_comercial", "comercial", "facturacion", "logistica"],
    "/billing-requests": ["administrador", "director_comercial", "facturacion"],
    "/invoices": ["administrador", "director_comercial", "facturacion", "comercial"],
    "/returns": ["administrador", "director_comercial", "facturacion", "comercial"],
    "/products": ["administrador", "director_comercial", "comercial"],
    "/segments": ["administrador", "director_comercial", "comercial"],
    "/reports": ["administrador", "director_comercial", "tecnico"],
    // Direccion ve la operacion completa; un comercial entra a las mismas
    // pantallas pero el back le fuerza `sellerUserId` a su propio id. Espeja el
    // @Roles de AnalyticsController — si aqui se abre y alla no, el usuario
    // entra a una pantalla que solo sabe devolver 403.
    "/analytics": ["administrador", "director_comercial", "comercial"],
    "/users": ["administrador"],
    "/companies": ["administrador", "director_comercial"],
    "/zones": ["administrador", "director_comercial"],
  };

  const allowedRoles = moduleAccess[moduleHref];
  if (!allowedRoles) return false;
  return allowedRoles.includes(role);
}

export function canCreate(role: UserRole | null, entity: "customer" | "opportunity" | "quote" | "visit" | "expense" | "followUp" | "order" | "billingRequest" | "invoice" | "returns" | "report" | "product"): boolean {
  if (!role) return false;

  const createAccess: Record<typeof entity, readonly UserRole[]> = {
    customer: ["administrador", "director_comercial", "comercial"],
    opportunity: ["administrador", "director_comercial", "comercial"],
    quote: ["administrador", "director_comercial", "comercial"],
    visit: ["administrador", "director_comercial", "comercial", "tecnico"],
    expense: ["administrador", "director_comercial", "comercial"],
    followUp: ["administrador", "director_comercial", "comercial", "tecnico"],
    order: ["administrador", "director_comercial", "comercial", "logistica"],
    billingRequest: ["administrador", "director_comercial", "facturacion"],
    invoice: ["administrador", "director_comercial", "facturacion"],
    returns: ["administrador", "director_comercial", "facturacion", "comercial"],
    report: ["administrador", "director_comercial", "tecnico"],
    // Espeja el @Roles del backend en products.controller.
    product: ["administrador", "director_comercial"],
  };

  return createAccess[entity].includes(role);
}
