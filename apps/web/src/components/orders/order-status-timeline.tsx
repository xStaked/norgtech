"use client";

const statuses = [
  { key: "recibido", label: "Recibido" },
  { key: "orden_facturacion", label: "Orden de facturación" },
  { key: "facturado", label: "Facturado" },
  { key: "despachado", label: "Despachado" },
  { key: "entregado", label: "Entregado" },
];

interface OrderStatusTimelineProps {
  currentStatus: string;
}

export function OrderStatusTimeline({ currentStatus }: OrderStatusTimelineProps) {
  const currentIndex = statuses.findIndex((s) => s.key === currentStatus);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
      {statuses.map((s, i) => {
        const isCompleted = i <= currentIndex;
        const isCurrent = i === currentIndex;
        return (
          <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                backgroundColor: isCurrent ? "#10233f" : isCompleted ? "#1f8f5f" : "#eef3f8",
                color: isCompleted ? "#ffffff" : "#6b7c93",
                fontSize: 13,
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              {s.label}
            </div>
            {i < statuses.length - 1 && (
              <div
                style={{
                  width: 24,
                  height: 2,
                  backgroundColor: i < currentIndex ? "#1f8f5f" : "#dbe4ef",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
