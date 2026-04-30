import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { OpportunityForm } from "@/components/opportunities/opportunity-form";

interface Customer {
  id: string;
  displayName: string;
}

export default async function NewOpportunityPage() {
  const response = await apiFetch("/customers");
  const customers: Customer[] = response.ok ? await response.json() : [];

  return (
    <div>
      <Link
        href="/opportunities"
        style={{
          fontSize: "0.875rem",
          color: "#52637a",
          textDecoration: "none",
          marginBottom: "1rem",
          display: "inline-block",
        }}
      >
        ← Volver a oportunidades
      </Link>

      <h1 style={{ marginTop: 0 }}>Nueva oportunidad</h1>

      <OpportunityForm customers={customers} />
    </div>
  );
}
