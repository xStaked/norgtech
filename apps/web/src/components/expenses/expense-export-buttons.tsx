"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetchClient } from "@/lib/api.client";

interface ExpenseExportButtonsProps {
  query?: Record<string, string | string[] | undefined>;
}

type ExportFormat = "csv" | "xlsx";

function buildExportPath(query: ExpenseExportButtonsProps["query"], format: ExportFormat) {
  const params = new URLSearchParams();

  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value === undefined) return;
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, item));
      return;
    }
    params.set(key, value);
  });

  params.set("format", format);
  return `/commercial-expenses/export?${params.toString()}`;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function ExpenseExportButtons({ query }: ExpenseExportButtonsProps) {
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<ExportFormat | null>(null);

  async function handleExport(format: ExportFormat) {
    setError(null);
    setDownloading(format);

    try {
      const response = await apiFetchClient(buildExportPath(query, format));
      if (!response.ok) {
        throw new Error("No se pudo descargar el archivo.");
      }

      const blob = await response.blob();
      downloadBlob(blob, format === "csv" ? "gastos.csv" : "gastos.xlsx");
    } catch {
      setError("No se pudo descargar el archivo.");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
      <Button
        type="button"
        variant="outline"
        onClick={() => void handleExport("csv")}
        disabled={downloading !== null}
      >
        <Download aria-hidden="true" />
        CSV
      </Button>
      <Button
        type="button"
        variant="secondary"
        onClick={() => void handleExport("xlsx")}
        disabled={downloading !== null}
      >
        <Download aria-hidden="true" />
        XLSX
      </Button>
      {error ? <span style={{ fontSize: 12, color: "#ef4444", fontWeight: 600 }}>{error}</span> : null}
    </div>
  );
}
