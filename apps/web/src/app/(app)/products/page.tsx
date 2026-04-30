import Link from "next/link";
import { apiFetch } from "@/lib/api.server";

interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  presentation: string | null;
  basePrice: string;
}

export default async function ProductsPage() {
  const response = await apiFetch("/products");
  const products: Product[] = response.ok ? await response.json() : [];

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
        }}
      >
        <h1 style={{ margin: 0 }}>Catálogo de productos</h1>
        <Link
          href="/products/new"
          style={{
            padding: "0.5rem 1rem",
            borderRadius: "0.5rem",
            backgroundColor: "#10233f",
            color: "#ffffff",
            textDecoration: "none",
            fontWeight: 600,
            fontSize: "0.875rem",
          }}
        >
          Nuevo producto
        </Link>
      </div>

      {products.length === 0 ? (
        <p style={{ color: "#52637a" }}>No hay productos registrados.</p>
      ) : (
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {products.map((product) => (
            <div
              key={product.id}
              style={{
                backgroundColor: "#ffffff",
                padding: "1rem 1.25rem",
                borderRadius: "0.75rem",
                boxShadow: "0 2px 8px rgba(16, 35, 63, 0.04)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ fontWeight: 600, color: "#10233f" }}>{product.name}</div>
                <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#27ae60" }}>
                  ${Number(product.basePrice).toLocaleString("es-CO")}
                </div>
              </div>
              <div style={{ fontSize: "0.875rem", color: "#52637a", marginTop: "0.25rem" }}>
                {product.sku} · {product.unit}
                {product.presentation && ` · ${product.presentation}`}
              </div>
              {product.description && (
                <div style={{ fontSize: "0.8125rem", color: "#6b7c93", marginTop: "0.5rem" }}>
                  {product.description}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
