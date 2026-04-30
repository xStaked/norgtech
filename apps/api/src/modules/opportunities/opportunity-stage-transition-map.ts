import { OpportunityStage } from "@prisma/client";

export const allowedTransitions: Record<OpportunityStage, OpportunityStage[]> = {
  prospecto: ["contacto", "perdida"],
  contacto: ["visita", "perdida"],
  visita: ["cotizacion", "perdida"],
  cotizacion: ["negociacion", "perdida"],
  negociacion: ["orden_facturacion", "perdida"],
  orden_facturacion: ["venta_cerrada", "perdida"],
  venta_cerrada: [],
  perdida: [],
};
