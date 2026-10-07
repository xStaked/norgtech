"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DebtorRow } from "@/lib/debtor-aging";

/** Decimal es-CO para Excel: coma decimal, sin separador de miles. */
function toCsvDecimal(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

function escapeCell(value: string): string {
  return /[";\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function buildCsv(rows: DebtorRow[]): string {
  const header = [
    "Cliente",
    "Moneda",
    "Saldo",
    "Vigente",
    "1-30",
    "31-60",
    "61-90",
    "+90",
    "Vencimiento más antiguo",
  ].join(";");
  const lines = rows.map((row) =>
    [
      escapeCell(row.customerName),
      row.currency,
      toCsvDecimal(row.balance),
      toCsvDecimal(row.current),
      toCsvDecimal(row.d1_30),
      toCsvDecimal(row.d31_60),
      toCsvDecimal(row.d61_90),
      toCsvDecimal(row.d90plus),
      row.oldestDueDate.slice(0, 10),
    ].join(";"),
  );
  // BOM para que Excel abra el UTF-8 (tildes) sin romperlo.
  return [`\uFEFF${header}`, ...lines].join("\r\n");
}

interface DebtorsCsvButtonProps {
  rows: DebtorRow[];
  asOf: string;
}

export function DebtorsCsvButton({ rows, asOf }: DebtorsCsvButtonProps) {
  const [error, setError] = useState<string | null>(null);

  function handleDownload() {
    setError(null);
    try {
      const blob = new Blob([buildCsv(rows)], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `deudores-${asOf}.csv`;
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
