import Link from "next/link";
import { apiFetch } from "@/lib/api.server";
import { OrderForm } from "@/components/orders/order-form";

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

interface Quote {
  id: string;
  customerId: string;
}

export default async function NewOrderPage() {
  const [customersRes, opportunitiesRes, productsRes, quotesRes] = await Promise.all([
    apiFetch("/customers"),
    apiFetch("/opportunities"),
    apiFetch("/products"),
    apiFetch("/quotes"),
  ]);

  const customers: Customer[] = customersRes.ok ? await customersRes.json() : [];
  const opportunities: Opportunity[] = opportunitiesRes.ok ? await opportunitiesRes.json() : [];
  const products: Product[] = productsRes.ok ? await productsRes.json() : [];
  const quotes: Quote[] = quotesRes.ok ? await quotesRes.json() : [];

  return (
    <div>
      <Link
        href="/orders"
        style={{
          fontSize: "0.875rem",
          color: "#52637a",
          textDecoration: "none",
          marginBottom: "1rem",
          display: "inline-block",
        }}
      >
        ← Volver a pedidos
      </Link>

      <h1 style={{ marginTop: 0 }}>Nuevo pedido</h1>

      <OrderForm
        customers={customers}
        opportunities={opportunities}
        products={products}
        quotes={quotes}
      />
    </div>
  );
}
