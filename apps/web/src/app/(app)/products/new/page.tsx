import { ButtonLink } from "@/components/ui/button-link";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { ProductForm } from "@/components/products/product-form";

export default function NewProductPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Productos"
        title="Nuevo producto"
        actions={
          <ButtonLink href="/products" variant="secondary">
            Volver a productos
          </ButtonLink>
        }
      />
      <SectionCard>
        <ProductForm />
      </SectionCard>
    </div>
  );
}
