import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { CustomerForm } from "@/components/customers/customer-form";

interface Segment {
  id: string;
  name: string;
}

export default async function NewCustomerPage() {
  const response = await apiFetch("/customer-segments");
  const segments: Segment[] = response.ok ? await response.json() : [];

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

      <h1 style={{ marginTop: 0 }}>Nuevo cliente</h1>

      <CustomerForm segments={segments} />
    </div>
  );
}
