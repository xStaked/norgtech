import { CommercialExpenseCategory } from "@prisma/client";

export type ExpenseExtractionStatus = "completed" | "low_confidence";

export interface ExtractedExpenseField<T> {
  value: T;
  confidence: number;
}

export interface ExtractCommercialExpenseSupportResult {
  status: ExpenseExtractionStatus;
  model: string;
  confidence: number;
  fields: {
    expenseDate?: ExtractedExpenseField<string>;
    amount?: ExtractedExpenseField<number>;
    currency?: ExtractedExpenseField<string>;
    category?: ExtractedExpenseField<CommercialExpenseCategory>;
    description?: ExtractedExpenseField<string>;
    supplierName?: ExtractedExpenseField<string>;
    supplierNit?: ExtractedExpenseField<string>;
    invoiceNumber?: ExtractedExpenseField<string>;
    paymentMethod?: ExtractedExpenseField<string>;
  };
  warnings: string[];
}
