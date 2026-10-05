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
  "/price-lists",
  // Liquidacion de comisiones: tambien renderiza en servidor con apiFetch, asi
  // que sin sesion valida iria a /login en vez de pintar una pantalla mocha.
  "/commissions",
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
  // Misma guarda que /invoices: solo roles con acceso a cartera ven deudores.
  { prefix: "/invoices/debtors", isAllowed: (role) => canAccess(role, "/invoices") },
  // Igual que deudores: reporte contable de lectura sobre la misma cartera.
  { prefix: "/invoices/accounting", isAllowed: (role) => canAccess(role, "/invoices") },
  { prefix: "/companies", isAllowed: (role) => canAccess(role, "/companies") },
  { prefix: "/zones", isAllowed: (role) => canAccess(role, "/zones") },
  { prefix: "/analytics", isAllowed: (role) => canAccess(role, "/analytics") },
  { prefix: "/reports", isAllowed: (role) => canAccess(role, "/reports") },
  { prefix: "/price-lists", isAllowed: (role) => canAccess(role, "/price-lists") },
  // Liquidacion de comisiones: misma matriz que @Roles del controlador. El
  // comercial entra, pero el back le fuerza el vendedor (solo las suyas).
  { prefix: "/commissions", isAllowed: (role) => canAccess(role, "/commissions") },
  { prefix: "/users", isAllowed: (role) => canAccess(role, "/users") },
  // ---------------------------------------------------------------------------
  // C-WEB-1..13 (docs/seguridad-brechas.md): el resto de pantallas solo se
  // ocultaba en el nav y un rol indebido con sesión entraba por URL directa.
  // Cada entrada espeja canAccess; las específicas (conjuntos distintos a los
  // del genérico) van ANTES para que find() las tome primero.
  // ---------------------------------------------------------------------------

  // D5 / C-WEB-8: entrar a /orders/review es de adm y fac (requiredRoles del
  // nav); debe preceder al genérico de /orders.
  { prefix: "/orders/review", isAllowed: (role) => canAccess(role, "/orders/review") },
  // D2: crear gastos no es de fac (la web mantiene lo restrictivo; la API sí
  // la admite por diseño D6/D2). Debe preceder al genérico de /expenses.
  { prefix: "/expenses/new", isAllowed: (role) => canCreate(role, "expense") },
  { prefix: "/visits", isAllowed: (role) => canAccess(role, "/visits") },
  { prefix: "/expenses", isAllowed: (role) => canAccess(role, "/expenses") },
  { prefix: "/follow-ups", isAllowed: (role) => canAccess(role, "/follow-ups") },
  { prefix: "/agenda", isAllowed: (role) => canAccess(role, "/agenda") },
  { prefix: "/nora", isAllowed: (role) => canAccess(role, "/nora") },
  // C-WEB-6 (D1 en web): la pantalla /opportunities nunca se abrió a tec; la
  // API solo lo admite para los flujos de visitas/seguimientos.
  { prefix: "/opportunities", isAllowed: (role) => canAccess(role, "/opportunities") },
  { prefix: "/quotes", isAllowed: (role) => canAccess(role, "/quotes") },
  { prefix: "/billing-requests", isAllowed: (role) => canAccess(role, "/billing-requests") },
  { prefix: "/invoices", isAllowed: (role) => canAccess(role, "/invoices") },
  { prefix: "/returns", isAllowed: (role) => canAccess(role, "/returns") },
  { prefix: "/products", isAllowed: (role) => canAccess(role, "/products") },
  { prefix: "/orders", isAllowed: (role) => canAccess(role, "/orders") },
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
