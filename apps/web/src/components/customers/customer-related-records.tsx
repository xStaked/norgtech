"use client";

import { InlineMetric } from "@/components/ui/inline-metric";
import { crmTheme } from "@/components/ui/theme";

interface CustomerRelatedRecordsProps {
  opportunitiesCount: number;
  visitsCount: number;
  followUpTasksCount: number;
  quotesCount: number;
  ordersCount: number;
  billingRequestsCount: number;
}

export function CustomerRelatedRecords({
  opportunitiesCount,
  visitsCount,
  followUpTasksCount,
  quotesCount,
  ordersCount,
  billingRequestsCount,
}: CustomerRelatedRecordsProps) {
  const metrics = [
    { label: "Oportunidades", value: opportunitiesCount, tone: "info" as const },
    { label: "Visitas", value: visitsCount, tone: "success" as const },
    { label: "Seguimientos", value: followUpTasksCount, tone: "warning" as const },
    { label: "Cotizaciones", value: quotesCount, tone: "info" as const },
    { label: "Pedidos", value: ordersCount, tone: "success" as const },
    { label: "Facturaciones", value: billingRequestsCount, tone: "neutral" as const },
  ];

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 12,
      }}
    >
      {metrics.map((m) => (
        <InlineMetric key={m.label} label={m.label} value={m.value} tone={m.tone} />
      ))}
    </div>
  );
}
