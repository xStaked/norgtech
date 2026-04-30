import Link from "next/link";
import { apiFetch } from "@/lib/api.server";
import { QuoteForm } from "@/components/quotes/quote-form";

interface Customer {
  id: string;
  displayName: string;
}

interface Opportunity {
  id: string;
  title: string;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  unit: string;
  basePrice: string;
}

export default async function NewQuotePage() {
  const [customersRes, opportunitiesRes, productsRes] = await Promise.all([
    apiFetch("/customers"),
    apiFetch("/opportunities"),
    apiFetch("/products"),
  ]);

  const customers: Customer[] = customersRes.ok ? await customersRes.json() : [];
  const opportunities: Opportunity[] = opportunitiesRes.ok ? await opportunitiesRes.json() : [];
  const products: Product[] = productsRes.ok ? await productsRes.json() : [];

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

      <h1 style={{ marginTop: 0 }}>Nueva cotización</h1>

      <QuoteForm customers={customers} opportunities={opportunities} products={products} />
    </div>
  );
}
