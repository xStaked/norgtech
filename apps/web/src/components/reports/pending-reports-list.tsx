"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { apiFetchClient } from "@/lib/api.client";

export interface PendingVisitItem {
  id: string;
  customerName: string | null;
  customerId: string | null;
  completedAt: string | null;
  scheduledAt: string;
  summary: string | null;
}

const dateFormatter = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function formatDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : dateFormatter.format(d);
}

export function PendingReportsList({ visits }: { visits: PendingVisitItem[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate(visitId: string) {
    setBusyId(visitId);
    setError(null);
    try {
      const response = await apiFetchClient(`/reports/from-visit/${visitId}`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        setError(data.message || "No se pudo generar el reporte");
        setBusyId(null);
        return;
      }
      const report = (await response.json()) as { id: string };
      router.push(`/reports/${report.id}`);
    } catch {
      setError("Error de conexión con el servidor");
      setBusyId(null);
    }
  }

  const columns: readonly DataTableColumn<PendingVisitItem>[] = [
    {
      key: "visit",
      header: "Visita",
      render: (row) => (
        <div style={{ display: "grid", gap: 4 }}>
          <Link href={`/visits/${row.id}`} style={{ color: "#0f5c8a", fontWeight: 700, textDecoration: "none" }}>
            {row.customerName ?? "Visita"} · {formatDate(row.completedAt ?? row.scheduledAt)}
          </Link>
          <span style={{ fontSize: 12.5, color: "#44556e" }}>
            {(row.summary ?? "").slice(0, 90)}
            {(row.summary ?? "").length > 90 ? "…" : ""}
          </span>
        </div>
      ),
    },
    {
      key: "action",
      header: "Reporte",
      align: "right",
      render: (row) => (
        <button
          type="button"
          onClick={() => void handleGenerate(row.id)}
          disabled={busyId === row.id}
          style={{
            minHeight: 32,
            padding: "0 12px",
            borderRadius: 8,
            border: 0,
            background: "#0f5c8a",
            color: "#fff",
            fontSize: 12.5,
            fontWeight: 700,
            cursor: busyId === row.id ? "not-allowed" : "pointer",
            opacity: busyId === row.id ? 0.7 : 1,
          }}
        >
          {busyId === row.id ? "Generando…" : "Generar"}
        </button>
      ),
    },
  ] as const;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {error && <p style={{ color: "#c0392b", fontSize: 13, margin: 0 }}>{error}</p>}
      <DataTable
        columns={columns}
        rows={visits}
        getRowKey={(row) => row.id}
        caption={`${visits.length.toLocaleString("es-CO")} visita(s) lista(s) para generar.`}
      />
    </div>
  );
}
