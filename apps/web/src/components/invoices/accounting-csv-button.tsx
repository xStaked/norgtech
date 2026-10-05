"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AccountingSummary } from "@/lib/accounting-report";

/** Decimal es-CO para Excel: coma decimal, sin separador de miles. */
function toCsvDecimal(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

function escapeCell(value: string): string {
  return /[";\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function buildAccountingCsv(
  summary: AccountingSummary,
  from: string,
  to: string,
): string {
  const header = ["Concepto", "Base", "Impuesto", "Total", "Facturas"].join(";");
  const row = (concept: string, base: string, tax: string, total: string, count: string) =>
    [escapeCell(concept), base, tax, total, count].join(";");
  const lines = [
    `Periodo;${from};${to};;`,
    row(
      "Ventas IVA 0%",
      toCsvDecimal(summary.salesByTax.rate0.base),
      toCsvDecimal(summary.salesByTax.rate0.tax),
      toCsvDecimal(summary.salesByTax.rate0.total),
      String(summary.salesByTax.rate0.count),
    ),
    row(
      "Ventas IVA 5%",
      toCsvDecimal(summary.salesByTax.rate5.base),
      toCsvDecimal(summary.salesByTax.rate5.tax),
      toCsvDecimal(summary.salesByTax.rate5.total),
      String(summary.salesByTax.rate5.count),
    ),
    row("Pagos recibidos", "", "", toCsvDecimal(summary.paymentsReceived), ""),
    row("Notas crédito", "", "", toCsvDecimal(summary.creditNotes), ""),
  ];
  // BOM para que Excel abra el UTF-8 (tildes) sin romperlo.
  return [`\uFEFF${header}`, ...lines].join("\r\n");
}

interface AccountingCsvButtonProps {
  summary: AccountingSummary;
  from: string;
  to: string;
}

export function AccountingCsvButton({ summary, from, to }: AccountingCsvButtonProps) {
  const [error, setError] = useState<string | null>(null);

  function handleDownload() {
    setError(null);
    try {
      const blob = new Blob([buildAccountingCsv(summary, from, to)], {
        type: "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `contable-${from}-${to}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("No se pudo generar el CSV.");
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Button type="button" variant="outline" onClick={handleDownload}>
        <Download aria-hidden="true" />
        CSV
      </Button>
      {error ? (
        <span style={{ fontSize: 12, color: "#ef4444", fontWeight: 600 }}>{error}</span>
      ) : null}
    </div>
  );
}
