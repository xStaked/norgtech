import {
  CommercialExpenseCategory,
  CommercialExpenseStatus,
} from "@prisma/client";

export const EXPENSE_SUPPORT_MAX_BYTES = 10 * 1024 * 1024;

export const EXPENSE_SUPPORT_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export const expenseStatusTransitions: Record<
  CommercialExpenseStatus,
  CommercialExpenseStatus[]
> = {
  [CommercialExpenseStatus.pendiente]: [
    CommercialExpenseStatus.aprobado,
    CommercialExpenseStatus.requiere_correccion,
    CommercialExpenseStatus.rechazado,
  ],
  [CommercialExpenseStatus.requiere_correccion]: [
    CommercialExpenseStatus.pendiente,
  ],
  [CommercialExpenseStatus.aprobado]: [
    CommercialExpenseStatus.contabilizado,
  ],
  [CommercialExpenseStatus.rechazado]: [],
  [CommercialExpenseStatus.contabilizado]: [],
};

export const expenseCategoryLabels: Record<CommercialExpenseCategory, string> = {
  [CommercialExpenseCategory.alimentacion]: "Alimentacion",
  [CommercialExpenseCategory.transporte]: "Transporte",
  [CommercialExpenseCategory.hospedaje]: "Hospedaje",
  [CommercialExpenseCategory.combustible]: "Combustible",
  [CommercialExpenseCategory.peajes]: "Peajes",
  [CommercialExpenseCategory.parqueadero]: "Parqueadero",
  [CommercialExpenseCategory.atencion_comercial]: "Atencion comercial",
  [CommercialExpenseCategory.otros]: "Otros",
};
