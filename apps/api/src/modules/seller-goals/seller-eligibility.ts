import { UserRole } from "@prisma/client";

/**
 * Roles que pueden ser "vendedor" de una venta: los unicos a los que se les
 * puede fijar una meta y a los que se les puede atribuir un pedido (GOAL-02).
 *
 * Regla unica compartida por `SellerGoalsService.ensureEligibleSeller` (que
 * lanza) y `OrdersService.create` (que necesita un chequeo no-lanzante para
 * decidir el fallback). Duplicar la lista de roles en los dos modulos es como
 * se desincronizan las dos fuentes de verdad que GOAL-02 justamente cierra.
 */
export const SELLER_ROLES: UserRole[] = [
  UserRole.comercial,
  UserRole.director_comercial,
];

/** Vendedor elegible = rol de venta Y usuario activo. */
export function isEligibleSeller(
  user: { role: UserRole; active: boolean } | null | undefined,
): boolean {
  return !!user && user.active && SELLER_ROLES.includes(user.role);
}
