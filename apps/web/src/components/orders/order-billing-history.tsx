interface BillingRequest {
  id: string;
  status: string;
  createdAt: string;
}

interface OrderBillingHistoryProps {
  billingRequests: BillingRequest[];
}

const statusLabels: Record<string, string> = {
  pendiente: "Pendiente",
  procesada: "Procesada",
  rechazada: "Rechazada",
};

export function OrderBillingHistory({ billingRequests }: OrderBillingHistoryProps) {
  if (billingRequests.length === 0) return null;
  return (
    <div className="mt-6">
      <h3 className="text-base font-semibold text-foreground">Solicitudes de facturación</h3>
      <div className="mt-3 grid gap-2">
        {billingRequests.map((br) => (
          <div
            key={br.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted p-3 text-sm"
          >
            <span className="font-semibold text-foreground">
              Solicitud #{br.id.slice(-6)}
            </span>
            <span className="text-muted-foreground">
              {statusLabels[br.status] ?? br.status} —{" "}
              {new Date(br.createdAt).toLocaleDateString("es-CO")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
