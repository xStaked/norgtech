"use client";

import { cn } from "@/lib/utils";

const statuses = [
  { key: "recibido", label: "Recibido" },
  { key: "orden_facturacion", label: "Orden de facturación" },
  { key: "facturado", label: "Facturado" },
  { key: "despachado", label: "Despachado" },
  { key: "en_transito", label: "En tránsito" },
  { key: "entregado", label: "Entregado" },
];

interface OrderStatusTimelineProps {
  currentStatus: string;
}

export function OrderStatusTimeline({ currentStatus }: OrderStatusTimelineProps) {
  const currentIndex = statuses.findIndex((s) => s.key === currentStatus);
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {statuses.map((s, i) => {
        const isCompleted = i <= currentIndex;
        const isCurrent = i === currentIndex;
        return (
          <div key={s.key} className="flex items-center gap-2">
            <div
              className={cn(
                "whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors",
                isCurrent && "bg-primary text-primary-foreground",
                isCompleted && !isCurrent && "bg-emerald-600 text-white",
                !isCompleted && "bg-muted text-muted-foreground"
              )}
            >
              {s.label}
            </div>
            {i < statuses.length - 1 && (
              <div
                className={cn(
                  "h-0.5 w-6 transition-colors",
                  i < currentIndex ? "bg-emerald-600" : "bg-border"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
