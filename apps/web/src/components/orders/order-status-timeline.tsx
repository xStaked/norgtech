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
    <div className="mt-3 grid gap-0">
      {statuses.map((s, i) => {
        const isCompleted = i <= currentIndex;
        const isCurrent = i === currentIndex;
        const isLast = i === statuses.length - 1;
        return (
          <div key={s.key} className="grid grid-cols-[22px_1fr] gap-2.5">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "flex h-[22px] w-[22px] items-center justify-center rounded-full text-[11px] transition-colors",
                  isCompleted ? "bg-[#e6f4ec] text-[#167c4a]" : "bg-[#eef1f5] text-[#9aa3b1]",
                )}
              >
                {isCompleted ? "✓" : ""}
              </div>
              {!isLast && (
                <div
                  className={cn(
                    "w-px flex-1",
                    i < currentIndex ? "bg-[#00a651]" : "bg-[#e4e7ec]",
                  )}
                />
              )}
            </div>
            <div className={cn("pb-4", isLast && "pb-0")}>
              <div
                className={cn(
                  "text-[12.5px]",
                  isCurrent
                    ? "font-bold text-[#0c2c44]"
                    : isCompleted
                      ? "font-semibold text-[#3a4658]"
                      : "text-[#9aa3b1]",
                )}
              >
                {s.label}
              </div>
              {isCurrent && (
                <div className="mt-0.5 text-[11px] text-[#9aa3b1]">Estado actual</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
