import { Injectable } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { AuthUser } from "../auth/types/authenticated-request";
import { PrismaService } from "../../prisma/prisma.service";
import { taxIdSearchVariants } from "../../common/tax-id";

export interface SearchHit {
  type: "customer" | "order" | "product";
  id: string;
  title: string;
  subtitle: string | null;
}

const LIMIT = 5;

/**
 * Quien ve cada tipo en el buscador. Espeja los requiredRoles del sidebar
 * (lib/theme.ts en web): el palette no puede ofrecer un modulo que el rol no
 * tiene permitido abrir.
 */
const VISIBLE_TO: Record<SearchHit["type"], readonly UserRole[]> = {
  customer: [
    "administrador",
    "director_comercial",
    "comercial",
    "tecnico",
    "facturacion",
    "logistica",
  ],
  order: ["administrador", "director_comercial", "comercial", "facturacion", "logistica"],
  product: ["administrador", "director_comercial", "comercial"],
};

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(user: AuthUser, rawQuery: string): Promise<SearchHit[]> {
    const q = rawQuery.trim();
    if (q.length < 2) return [];

    const can = (type: SearchHit["type"]) => VISIBLE_TO[type].includes(user.role);

    const [customers, orders, products] = await Promise.all([
      can("customer")
        ? this.prisma.customer.findMany({
            where: {
              active: true,
              OR: [
                { displayName: { contains: q, mode: "insensitive" } },
                { legalName: { contains: q, mode: "insensitive" } },
                { taxId: { contains: q, mode: "insensitive" } },
                ...taxIdSearchVariants(q).map((variant) => ({
                  taxId: { contains: variant, mode: "insensitive" as const },
                })),
              ],
            },
            select: { id: true, displayName: true, taxId: true, city: true },
            orderBy: { displayName: "asc" },
            take: LIMIT,
          })
        : [],
      can("order")
        ? this.prisma.order.findMany({
            where: {
              OR: [
                { orderNumber: { contains: q, mode: "insensitive" } },
                { purchaseOrderNumber: { contains: q, mode: "insensitive" } },
                { customerNameSnapshot: { contains: q, mode: "insensitive" } },
                { customer: { displayName: { contains: q, mode: "insensitive" } } },
              ],
            },
            select: {
              id: true,
              orderNumber: true,
              status: true,
              customerNameSnapshot: true,
              customer: { select: { displayName: true } },
            },
            orderBy: { orderDate: "desc" },
            take: LIMIT,
          })
        : [],
      can("product")
        ? this.prisma.product.findMany({
            where: {
              active: true,
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { sku: { contains: q, mode: "insensitive" } },
              ],
            },
            select: { id: true, name: true, sku: true, presentation: true },
            orderBy: { name: "asc" },
            take: LIMIT,
          })
        : [],
    ]);

    return [
      ...customers.map((c) => ({
        type: "customer" as const,
        id: c.id,
        title: c.displayName,
        subtitle: [c.taxId, c.city].filter(Boolean).join(" · ") || null,
      })),
      ...orders.map((o) => ({
        type: "order" as const,
        id: o.id,
        title: o.orderNumber ?? `Pedido ${o.id.slice(0, 8)}`,
        subtitle:
          [o.customer?.displayName ?? o.customerNameSnapshot, o.status]
            .filter(Boolean)
            .join(" · ") || null,
      })),
      ...products.map((p) => ({
        type: "product" as const,
        id: p.id,
        title: p.name,
        subtitle: [p.sku, p.presentation].filter(Boolean).join(" · ") || null,
      })),
    ];
  }
}
