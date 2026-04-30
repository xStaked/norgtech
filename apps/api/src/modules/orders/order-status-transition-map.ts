import { OrderStatus } from "@prisma/client";

export const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
  recibido: ["orden_facturacion"],
  orden_facturacion: ["facturado"],
  facturado: ["despachado"],
  despachado: ["entregado"],
  entregado: [],
};
