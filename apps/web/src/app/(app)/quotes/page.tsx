import Link from "next/link";
import { apiFetch } from "@/lib/api.server";

interface Customer {
  id: string;
  displayName: string;
}

interface Quote {
  id: string;
  status: string;
  subtotal: string;
  total: string;
  customer: Customer | null;
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

export default async function QuotesPage() {
  const response = await apiFetch("/quotes");
  const quotes: Quote[] = response.ok ? await response.json() : [];

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
        }}
      >
        <h1 style={{ margin: 0 }}>Cotizaciones</h1>
        <Link
          href="/quotes/new"
          style={{
            padding: "0.5rem 1rem",
            borderRadius: "0.5rem",
            backgroundColor: "#10233f",
            color: "#ffffff",
            textDecoration: "none",
            fontWeight: 600,
            fontSize: "0.875rem",
          }}
        >
          Nueva cotización
        </Link>
      </div>

      {quotes.length === 0 ? (
        <p style={{ color: "#52637a" }}>No hay cotizaciones registradas.</p>
      ) : (
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {quotes.map((quote) => (
            <Link
              key={quote.id}
              href={`/quotes/${quote.id}`}
              style={{
                display: "block",
                backgroundColor: "#ffffff",
                padding: "1rem 1.25rem",
                borderRadius: "0.75rem",
                boxShadow: "0 2px 8px rgba(16, 35, 63, 0.04)",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ fontWeight: 600, color: "#10233f" }}>
                  Cotización #{quote.id.slice(-6)}
                </div>
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    padding: "0.25rem 0.5rem",
                    borderRadius: "0.25rem",
                    backgroundColor: statusColors[quote.status] || "#6b7c93",
                    color: "#ffffff",
                    whiteSpace: "nowrap",
                  }}
                >
                  {statusLabels[quote.status] || quote.status}
                </span>
              </div>
              <div style={{ fontSize: "0.875rem", color: "#52637a", marginTop: "0.25rem" }}>
                {quote.customer?.displayName}
              </div>
              <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#27ae60", marginTop: "0.5rem" }}>
                Total: ${Number(quote.total).toLocaleString("es-CO")}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
