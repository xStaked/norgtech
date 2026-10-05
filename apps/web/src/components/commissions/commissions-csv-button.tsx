"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CommissionLiquidationRow } from "@/lib/commissions-summary";

/** Decimal es-CO para Excel: coma decimal, sin separador de miles. */
function toCsvDecimal(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

function escapeCell(value: string): string {
  return /[";\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function buildCommissionsCsv(
  rows: CommissionLiquidationRow[],
  from: string,
  to: string,
): string {
  const header = [
    "Periodo",
    "Vendedor",
    "Factura",
    "Cliente",
    "Fecha pago",
    "Base",
    "Porcentaje",
    "Comision",
    "Revertido",
    "Neto",
    "Estado",
  ].join(";");
  const lines = rows.map((row) =>
    [
      escapeCell(`${from} a ${to}`),
      escapeCell(row.sellerName),
      escapeCell(row.invoiceNumber ?? ""),
      escapeCell(row.customerName ?? ""),
      row.paymentDate,
      toCsvDecimal(row.base),
      toCsvDecimal(row.percent),
      toCsvDecimal(row.amount),
      toCsvDecimal(row.reversedAmount),
      toCsvDecimal(row.net),
      row.estadoLabel,
    ].join(";"),
  );
  // BOM para que Excel abra el UTF-8 (tildes) sin romperlo.
  return [`\uFEFF${header}`, ...lines].join("\r\n");
}

interface CommissionsCsvButtonProps {
  rows: CommissionLiquidationRow[];
  from: string;
  to: string;
}

export function CommissionsCsvButton({ rows, from, to }: CommissionsCsvButtonProps) {
  const [error, setError] = useState<string | null>(null);

  function handleDownload() {
    setError(null);
    try {
      const blob = new Blob([buildCommissionsCsv(rows, from, to)], {
        type: "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `comisiones-${from}-${to}.csv`;
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
      {error ? <span style={{ fontSize: 12, color: "#ef4444", fontWeight: 600 }}>{error}</span> : null}
    </div>
  );
}
