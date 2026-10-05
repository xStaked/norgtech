/** Visitas listas para generar reporte y aún sin reporte. */

export interface PendingVisit {
  id: string;
  status: string;
  summary?: string | null;
}

export interface LinkedReport {
  id: string;
  visitId?: string | null;
  visit?: { id: string } | null;
}

/** Completada + con resumen + sin reporte vinculado. */
export function pendingReportVisits<T extends PendingVisit>(
  visits: T[],
  reports: LinkedReport[],
): T[] {
  const reported = new Set(
    reports.map((r) => r.visit?.id ?? r.visitId ?? "").filter(Boolean),
  );
  return visits.filter(
    (v) => v.status === "completada" && Boolean(v.summary?.trim()) && !reported.has(v.id),
  );
}
