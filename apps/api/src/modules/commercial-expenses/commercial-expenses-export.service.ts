import { Injectable } from "@nestjs/common";
import ExcelJS from "exceljs";

export interface ExpenseExportRow {
  expenseDate: Date;
  submittedByName: string;
  category: string;
  amount: number | string;
  currency: string;
  customerName: string | null;
  visitId: string | null;
  status: string;
  description: string;
  reviewNote: string | null;
  reviewedAt: Date | null;
  reviewedByName: string | null;
  createdAt: Date;
}

const EXPORT_COLUMNS = [
  "fecha",
  "comercial",
  "categoria",
  "monto",
  "moneda",
  "cliente",
  "visita",
  "estado",
  "descripcion",
  "nota_revision",
  "fecha_revision",
  "revisor",
  "fecha_creacion",
] as const;

@Injectable()
export class CommercialExpensesExportService {
  readonly csvContentType = "text/csv; charset=utf-8";
  readonly xlsxContentType =
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  generateCsv(rows: ExpenseExportRow[]): Buffer {
    const lines = [
      EXPORT_COLUMNS.join(","),
      ...rows.map((row) =>
        this.toValues(row).map((value) => this.escapeCsv(value)).join(","),
      ),
    ];

    return Buffer.from(lines.join("\n"), "utf8");
  }

  async generateXlsx(rows: ExpenseExportRow[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Gastos");

    worksheet.addRow([...EXPORT_COLUMNS]);
    worksheet.getRow(1).font = { bold: true };

    for (const row of rows) {
      worksheet.addRow(this.toValues(row));
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  }

  private toValues(row: ExpenseExportRow): string[] {
    return [
      this.formatDate(row.expenseDate),
      row.submittedByName,
      row.category,
      String(row.amount),
      row.currency,
      row.customerName ?? "",
      row.visitId ?? "",
      row.status,
      row.description,
      row.reviewNote ?? "",
      this.formatDate(row.reviewedAt),
      row.reviewedByName ?? "",
      this.formatDate(row.createdAt),
    ].map((value) => this.neutralizeFormulaValue(value));
  }

  private escapeCsv(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
  }

  private neutralizeFormulaValue(value: string): string {
    if (/^[=+\-@\t\r\n]/.test(value)) {
      return `'${value}`;
    }

    return value;
  }

  private formatDate(value: Date | null): string {
    if (!value) return "";
    return value.toISOString();
  }
}
