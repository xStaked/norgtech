import Link from "next/link";
import { apiFetch } from "@/lib/api.server";
import { VisitForm } from "@/components/visits/visit-form";

interface Customer {
  id: string;
  displayName: string;
}

interface Opportunity {
  id: string;
  title: string;
}

export default async function NewVisitPage() {
  const [customersRes, opportunitiesRes] = await Promise.all([
    apiFetch("/customers"),
    apiFetch("/opportunities"),
  ]);

  const customers: Customer[] = customersRes.ok ? await customersRes.json() : [];
  const opportunities: Opportunity[] = opportunitiesRes.ok ? await opportunitiesRes.json() : [];

  return (
    <div>
      <Link
        href="/visits"
        style={{
          fontSize: "0.875rem",
          color: "#52637a",
          textDecoration: "none",
          marginBottom: "1rem",
          display: "inline-block",
        }}
      >
        ← Volver a visitas
      </Link>

      <h1 style={{ marginTop: 0 }}>Nueva visita</h1>

      <VisitForm customers={customers} opportunities={opportunities} />
    </div>
  );
}
