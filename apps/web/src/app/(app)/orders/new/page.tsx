import { ButtonLink } from "@/components/ui/button-link";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
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
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pedidos"
        title="Nuevo pedido"
        actions={
          <ButtonLink href="/orders" variant="secondary">
            Volver a pedidos
          </ButtonLink>
        }
      />
      <SectionCard>
        <OrderForm
          customers={customers}
          opportunities={opportunities}
          products={products}
          quotes={quotes}
        />
      </SectionCard>
    </div>
  );
}
