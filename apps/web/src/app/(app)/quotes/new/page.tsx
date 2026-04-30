import { ButtonLink } from "@/components/ui/button-link";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
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
    <div style={{ display: "grid", gap: 24 }}>
      <PageHeader
        eyebrow="Cotizaciones"
        title="Nueva cotización"
        description="Crea una propuesta comercial con contexto de cliente, oportunidad e items valorizados."
        actions={
          <ButtonLink href="/quotes" variant="secondary">
            Volver a cotizaciones
          </ButtonLink>
        }
      />

      <SectionCard
        title="Formulario comercial"
        description="Completa los datos base y arma el detalle económico de la propuesta."
      >
        <QuoteForm customers={customers} opportunities={opportunities} products={products} />
      </SectionCard>
    </div>
  );
}
