import { canAccess, canCreate, type UserRole } from "@/lib/auth";

// Route prefixes that only require an authenticated session (any role).
export const protectedPaths = [
  "/dashboard",
  "/customers",
  "/opportunities",
  "/quotes",
  "/orders",
  "/billing-requests",
  "/products",
  "/segments",
  "/visits",
  "/expenses",
  "/follow-ups",
  "/agenda",
  "/nora",
  "/companies",
  "/zones",
  "/invoices",
  "/analytics",
  "/reports",
  // Tambien renderizan en servidor: sin sesion valida daban 200 con la pantalla
  // vacia en vez de mandar al login.
  "/users",
  "/whatsapp",
  "/returns",
];

interface RoleRestrictedRoute {
  prefix: string;
  isAllowed: (role: UserRole | null) => boolean;
}

// Route prefixes that require more than "has a session" — the role must also
// pass the corresponding moduleAccess/createAccess rule from src/lib/auth.ts.
const roleRestrictedRoutes: readonly RoleRestrictedRoute[] = [
  { prefix: "/customers/new", isAllowed: (role) => canCreate(role, "customer") },
  { prefix: "/opportunities/new", isAllowed: (role) => canCreate(role, "opportunity") },
  { prefix: "/quotes/new", isAllowed: (role) => canCreate(role, "quote") },
  { prefix: "/orders/new", isAllowed: (role) => canCreate(role, "order") },
  { prefix: "/invoices/new", isAllowed: (role) => canCreate(role, "invoice") },
  { prefix: "/companies", isAllowed: (role) => canAccess(role, "/companies") },
  { prefix: "/zones", isAllowed: (role) => canAccess(role, "/zones") },
  { prefix: "/analytics", isAllowed: (role) => canAccess(role, "/analytics") },
  { prefix: "/reports", isAllowed: (role) => canAccess(role, "/reports") },
];

export function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Pure decision function for the role-based route guard.
 * Returns the path to redirect to, or null if the request should proceed.
 * No/invalid role on a protected path -> "/login".
 * Valid role but not allowed for the path -> "/dashboard?forbidden=1".
 */
export function resolveRoleRedirect(pathname: string, role: UserRole | null): string | null {
  const isProtectedPath = protectedPaths.some((protectedPath) => matchesPrefix(pathname, protectedPath));

  if (!isProtectedPath) {
    return null;
  }

  if (!role) {
    return "/login";
  }

  const restriction = roleRestrictedRoutes.find((route) => matchesPrefix(pathname, route.prefix));
  if (restriction && !restriction.isAllowed(role)) {
    return "/dashboard?forbidden=1";
  }

  return null;
}
