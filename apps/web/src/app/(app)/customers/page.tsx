import Link from "next/link";
import { apiFetch } from "@/lib/api.server";

interface Contact {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
}

interface Segment {
  id: string;
  name: string;
}

interface Customer {
  id: string;
  legalName: string;
  displayName: string;
  taxId: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  department: string | null;
  segment: Segment | null;
  contacts: Contact[];
}

export default async function CustomersPage() {
  const response = await apiFetch("/customers");
  const customers: Customer[] = response.ok ? await response.json() : [];

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
        <h1 style={{ margin: 0 }}>Clientes</h1>
        <Link
          href="/customers/new"
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
          Nuevo cliente
        </Link>
      </div>

      {customers.length === 0 ? (
        <p style={{ color: "#52637a" }}>No hay clientes registrados.</p>
      ) : (
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {customers.map((customer) => (
            <Link
              key={customer.id}
              href={`/customers/${customer.id}`}
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
              <div style={{ fontWeight: 600, color: "#10233f" }}>
                {customer.displayName}
              </div>
              <div style={{ fontSize: "0.875rem", color: "#52637a", marginTop: "0.25rem" }}>
                {customer.legalName}
                {customer.segment && ` · ${customer.segment.name}`}
                {customer.city && ` · ${customer.city}`}
                {customer.department && `, ${customer.department}`}
              </div>
              {customer.contacts.length > 0 && (
                <div style={{ fontSize: "0.8125rem", color: "#6b7c93", marginTop: "0.5rem" }}>
                  {customer.contacts
                    .filter((c) => c.isPrimary)
                    .map((c) => `Contacto: ${c.fullName}${c.phone ? ` · ${c.phone}` : ""}${c.email ? ` · ${c.email}` : ""}`)
                    .join(" | ")}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
