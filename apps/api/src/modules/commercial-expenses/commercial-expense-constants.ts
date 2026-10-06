import {
  CommercialExpenseCategory,
  CommercialExpenseStatus,
} from "@prisma/client";
// Fuente compartida con los soportes de pago de facturas. Se reexporta con el
// nombre historico para no romper los imports del modulo de gastos.
import {
  SUPPORT_FILE_ALLOWED_MIME_TYPES,
  SUPPORT_FILE_MAX_BYTES,
} from "../../shared/support-file.constants";

export const EXPENSE_SUPPORT_MAX_BYTES = SUPPORT_FILE_MAX_BYTES;

export const EXPENSE_SUPPORT_ALLOWED_MIME_TYPES = SUPPORT_FILE_ALLOWED_MIME_TYPES;

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
  [CommercialExpenseCategory.atencion_comercial]: "Cliente / atencion comercial",
  [CommercialExpenseCategory.otros]: "Otros",
};
