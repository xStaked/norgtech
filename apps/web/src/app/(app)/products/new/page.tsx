import Link from "next/link";
import { ProductForm } from "@/components/products/product-form";

export default function NewProductPage() {
  return (
    <div>
      <Link
        href="/products"
        style={{
          fontSize: "0.875rem",
          color: "#52637a",
          textDecoration: "none",
          marginBottom: "1rem",
          display: "inline-block",
        }}
      >
        ← Volver a productos
      </Link>

      <h1 style={{ marginTop: 0 }}>Nuevo producto</h1>

      <ProductForm />
    </div>
  );
}
