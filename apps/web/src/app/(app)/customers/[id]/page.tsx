import Link from "next/link";
import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api.server";

interface Contact {
  id: string;
  fullName: string;
  roleTitle: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  notes: string | null;
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
  address: string | null;
  city: string | null;
  department: string | null;
  notes: string | null;
  segment: Segment | null;
  contacts: Contact[];
  createdAt: string;
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const response = await apiFetch(`/customers/${id}`);

  if (!response.ok) {
    notFound();
  }

  const customer: Customer = await response.json();

  return (
    <div>
      <Link
        href="/customers"
        style={{
          fontSize: "0.875rem",
          color: "#52637a",
          textDecoration: "none",
          marginBottom: "1rem",
          display: "inline-block",
        }}
      >
        ← Volver a clientes
      </Link>

      <div
        style={{
          backgroundColor: "#ffffff",
          padding: "1.5rem",
          borderRadius: "0.75rem",
          boxShadow: "0 2px 8px rgba(16, 35, 63, 0.04)",
        }}
      >
        <h1 style={{ marginTop: 0 }}>{customer.displayName}</h1>
        <p style={{ color: "#52637a", marginTop: "0.25rem" }}>{customer.legalName}</p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(14rem, 1fr))",
            gap: "1rem",
            marginTop: "1.5rem",
          }}
        >
          <Info label="NIT" value={customer.taxId} />
          <Info label="Teléfono" value={customer.phone} />
          <Info label="Correo" value={customer.email} />
          <Info label="Dirección" value={customer.address} />
          <Info label="Ciudad" value={customer.city} />
          <Info label="Departamento" value={customer.department} />
          <Info label="Segmento" value={customer.segment?.name} />
        </div>

        {customer.notes && (
          <div style={{ marginTop: "1.5rem" }}>
            <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#6b7c93" }}>Notas</div>
            <div style={{ marginTop: "0.25rem", color: "#10233f" }}>{customer.notes}</div>
          </div>
        )}

        {customer.contacts.length > 0 && (
          <div style={{ marginTop: "1.5rem" }}>
            <h3 style={{ margin: 0, fontSize: "1rem" }}>Contactos</h3>
            <div style={{ display: "grid", gap: "0.75rem", marginTop: "0.75rem" }}>
              {customer.contacts.map((contact) => (
                <div
                  key={contact.id}
                  style={{
                    padding: "0.75rem 1rem",
                    borderRadius: "0.5rem",
                    border: "1px solid #e2e8f0",
                    backgroundColor: "#f8fafc",
                  }}
                >
                  <div style={{ fontWeight: 600 }}>
                    {contact.fullName}
                    {contact.isPrimary && (
                      <span
                        style={{
                          fontSize: "0.75rem",
                          backgroundColor: "#10233f",
                          color: "#ffffff",
                          padding: "0.125rem 0.5rem",
                          borderRadius: "0.25rem",
                          marginLeft: "0.5rem",
                          fontWeight: 500,
                        }}
                      >
                        Principal
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: "0.875rem", color: "#52637a", marginTop: "0.25rem" }}>
                    {contact.roleTitle && `${contact.roleTitle} · `}
                    {contact.phone && `${contact.phone} · `}
                    {contact.email}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
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
