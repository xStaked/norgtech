import { Injectable } from "@nestjs/common";
import ExcelJS from "exceljs";
import { BOGOTA_OFFSET } from "../../shared/instant";

export interface ExpenseExportRow {
  expenseDate: Date;
  submittedByName: string;
  category: string;
  amount: number | string;
  currency: string;
  supplierName: string | null;
  supplierNit: string | null;
  invoiceNumber: string | null;
  paymentMethod: string | null;
  customerName: string | null;
  visitId: string | null;
  status: string;
  description: string;
  reviewNote: string | null;
  reviewedAt: Date | null;
  reviewedByName: string | null;
  extractionConfidence: string | null;
  extractionModel: string | null;
  createdAt: Date;
}

// EXP-02: encabezados de exportacion en espanol legible (antes eran los codigos
// snake_case internos). El orden refleja 1:1 el orden de `toValues`.
const EXPORT_COLUMNS = [
  "Fecha",
  "Comercial",
  "Categoría",
  "Monto",
  "Moneda",
  "Proveedor",
  "NIT",
  "Número de factura",
  "Medio de pago",
  "Cliente",
  "Visita",
  "Estado",
  "Descripción",
  "Nota de revisión",
  "Fecha de revisión",
  "Revisor",
  "Confianza de extracción",
  "Modelo de extracción",
  "Fecha de creación",
] as const;

// EXP-03: Colombia es UTC-5 todo el año (sin DST), asi que basta desplazar el
// instante UTC por el offset y leer los componentes UTC. Es independiente de la
// zona horaria del proceso (por eso funciona bajo TZ=UTC y TZ=America/Bogota).
const BOGOTA_OFFSET_MINUTES = (() => {
  const match = BOGOTA_OFFSET.match(/([+-])(\d{2}):(\d{2})/);
  if (!match) return 0;
  const [, sign, hours, minutes] = match;
  const total = Number(hours) * 60 + Number(minutes);
  return sign === "-" ? -total : total;
})();

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
      row.supplierName ?? "",
      row.supplierNit ?? "",
      row.invoiceNumber ?? "",
      row.paymentMethod ?? "",
      row.customerName ?? "",
      row.visitId ?? "",
      row.status,
      row.description,
      row.reviewNote ?? "",
      this.formatDate(row.reviewedAt),
      row.reviewedByName ?? "",
      row.extractionConfidence ?? "",
      row.extractionModel ?? "",
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

  private formatDate(value: Date | null | undefined): string {
    if (!value) return "";
    const time = value.getTime();
    if (Number.isNaN(time)) return "";

    // Desplaza el instante UTC al horario de pared de Colombia y lee los
    // componentes en UTC: dd/mm/aaaa HH:mm, sin depender de la TZ del proceso.
    const shifted = new Date(time + BOGOTA_OFFSET_MINUTES * 60_000);
    const dd = String(shifted.getUTCDate()).padStart(2, "0");
    const mm = String(shifted.getUTCMonth() + 1).padStart(2, "0");
    const yyyy = shifted.getUTCFullYear();
    const hh = String(shifted.getUTCHours()).padStart(2, "0");
    const min = String(shifted.getUTCMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  }
}
