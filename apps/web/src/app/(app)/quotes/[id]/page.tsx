import Link from "next/link";
import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api.server";

interface Customer {
  id: string;
  displayName: string;
}

interface Opportunity {
  id: string;
  title: string;
}

interface QuoteItem {
  id: string;
  productSnapshotName: string;
  productSnapshotSku: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  subtotal: string;
  notes: string | null;
}

interface Quote {
  id: string;
  status: string;
  subtotal: string;
  total: string;
  notes: string | null;
  validUntil: string | null;
  customer: Customer | null;
  opportunity: Opportunity | null;
  items: QuoteItem[];
  createdAt: string;
}

const statusLabels: Record<string, string> = {
  abierta: "Abierta",
  en_negociacion: "En negociación",
  cerrada: "Cerrada",
  perdida: "Perdida",
};

const statusColors: Record<string, string> = {
  abierta: "#3498db",
  en_negociacion: "#f39c12",
  cerrada: "#27ae60",
  perdida: "#c0392b",
};

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const response = await apiFetch(`/quotes/${id}`);

  if (!response.ok) {
    notFound();
  }

  const quote: Quote = await response.json();

  return (
    <div>
      <Link
        href="/quotes"
        style={{
          fontSize: "0.875rem",
          color: "#52637a",
          textDecoration: "none",
          marginBottom: "1rem",
          display: "inline-block",
        }}
      >
        ← Volver a cotizaciones
      </Link>

      <div
        style={{
          backgroundColor: "#ffffff",
          padding: "1.5rem",
          borderRadius: "0.75rem",
          boxShadow: "0 2px 8px rgba(16, 35, 63, 0.04)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
          <h1 style={{ margin: 0 }}>Cotización #{quote.id.slice(-6)}</h1>
          <span
            style={{
              fontSize: "0.875rem",
              fontWeight: 600,
              padding: "0.375rem 0.75rem",
              borderRadius: "0.375rem",
              backgroundColor: statusColors[quote.status] || "#6b7c93",
              color: "#ffffff",
            }}
          >
            {statusLabels[quote.status] || quote.status}
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(14rem, 1fr))",
            gap: "1rem",
            marginTop: "1.5rem",
          }}
        >
          <Info label="Cliente" value={quote.customer?.displayName} />
          <Info label="Oportunidad" value={quote.opportunity?.title} />
          <Info
            label="Válida hasta"
            value={quote.validUntil ? new Date(quote.validUntil).toLocaleDateString("es-CO") : null}
          />
        </div>

        {quote.notes && (
          <div style={{ marginTop: "1.5rem" }}>
            <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#6b7c93" }}>Notas</div>
            <div style={{ marginTop: "0.25rem", color: "#10233f" }}>{quote.notes}</div>
          </div>
        )}

        <div style={{ marginTop: "1.5rem" }}>
          <h3 style={{ margin: 0, fontSize: "1rem" }}>Items</h3>
          <div style={{ display: "grid", gap: "0.75rem", marginTop: "0.75rem" }}>
            {quote.items.map((item) => (
              <div
                key={item.id}
                style={{
                  padding: "0.75rem 1rem",
                  borderRadius: "0.5rem",
                  border: "1px solid #e2e8f0",
                  backgroundColor: "#f8fafc",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ fontWeight: 600 }}>{item.productSnapshotName}</div>
                  <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#27ae60" }}>
                    ${Number(item.subtotal).toLocaleString("es-CO")}
                  </div>
                </div>
                <div style={{ fontSize: "0.875rem", color: "#52637a", marginTop: "0.25rem" }}>
                  {item.productSnapshotSku} · {Number(item.quantity).toLocaleString("es-CO")} {item.unit} · $
                  {Number(item.unitPrice).toLocaleString("es-CO")}/{item.unit}
                </div>
                {item.notes && (
                  <div style={{ fontSize: "0.8125rem", color: "#6b7c93", marginTop: "0.25rem" }}>
                    {item.notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "1rem",
            borderRadius: "0.5rem",
            backgroundColor: "#f0f4f8",
            marginTop: "1.5rem",
            fontWeight: 600,
            fontSize: "1.125rem",
          }}
        >
          <span>Total</span>
          <span style={{ color: "#10233f" }}>${Number(quote.total).toLocaleString("es-CO")}</span>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#6b7c93" }}>{label}</div>
      <div style={{ marginTop: "0.25rem", color: "#10233f" }}>{value}</div>
    </div>
  );
}
