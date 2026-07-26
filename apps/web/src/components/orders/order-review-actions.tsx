"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetchClient } from "@/lib/api.client";
import { getSessionTokenClient, getUserRoleFromToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

interface ReviewItem {
  id: string;
  productSnapshotName: string | null;
  customProductName: string | null;
  quantity: string | number;
  needsResolution?: boolean;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  unit: string;
  basePrice: string;
}

interface ItemResolutionState {
  productId: string;
  unitPrice: number;
}

interface OrderReviewActionsProps {
  orderId: string;
  approvalStatus: string | null;
  items: ReviewItem[];
}

const reviewRoles = ["administrador", "facturacion"] as const;

export function OrderReviewActions({ orderId, approvalStatus, items }: OrderReviewActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [resolutions, setResolutions] = useState<Record<string, ItemResolutionState>>({});

  const role = getUserRoleFromToken(getSessionTokenClient());

  const isReviewerView =
    approvalStatus === "en_revision" && role && (reviewRoles as readonly string[]).includes(role);

  useEffect(() => {
    if (!isReviewerView) {
      return;
    }
    apiFetchClient("/products")
      .then((r) => {
        if (!r.ok) {
          setError("No se pudo cargar el catálogo de productos (error del servidor)");
          setProducts([]);
          return [];
        }
        return r.json();
      })
      .then((data: Product[]) => setProducts(Array.isArray(data) ? data : []))
      .catch(() => {
        setError("No se pudo cargar el catálogo de productos");
        setProducts([]);
      });
  }, [isReviewerView]);

  if (!isReviewerView) {
    return null;
  }

  const unresolvedItems = items.filter((item) => item.needsResolution);

  function updateResolution(itemId: string, field: keyof ItemResolutionState, value: string | number) {
    setResolutions((prev) => {
      const current = prev[itemId] ?? { productId: "", unitPrice: 0 };
      const updated = { ...current, [field]: value };

      if (field === "productId") {
        const product = products.find((p) => p.id === value);
        if (product) {
          updated.unitPrice = Number(product.basePrice);
        }
      }

      return { ...prev, [itemId]: updated };
    });
  }

  async function resolveItem(itemId: string) {
    const resolution = resolutions[itemId];
    if (!resolution?.productId) {
      setError("Selecciona un producto para resolver el ítem");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetchClient(`/orders/${orderId}/items/${itemId}/resolve`, {
        method: "PATCH",
        body: JSON.stringify({ productId: resolution.productId, unitPrice: resolution.unitPrice }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { message?: string }).message || "Error al resolver el ítem");
        return;
      }
      router.refresh();
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  async function approve() {
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetchClient(`/orders/${orderId}/approve`, { method: "PATCH" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { message?: string }).message || "No se pudo aprobar");
        return;
      }
      router.refresh();
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  async function reject() {
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetchClient(`/orders/${orderId}/reject`, {
        method: "PATCH",
        body: JSON.stringify({ reason: rejectReason }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { message?: string }).message || "No se pudo rechazar");
        return;
      }
      router.refresh();
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
      <h3 className="text-base font-semibold text-foreground">Revisión del pedido</h3>

      {unresolvedItems.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
            {unresolvedItems.length} ítem(s) requieren resolución antes de aprobar:
          </p>
          {unresolvedItems.map((item) => {
            const resolution = resolutions[item.id] ?? { productId: "", unitPrice: 0 };
            const selectedProduct = products.find((p) => p.id === resolution.productId);
            return (
              <div
                key={item.id}
                className="grid gap-3 rounded-lg border border-border bg-background p-3"
              >
                <div className="text-sm font-medium text-foreground">
                  {item.productSnapshotName || item.customProductName || "Ítem sin nombre"} ×{" "}
                  {item.quantity}
                </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_10rem_auto]">
                  <div className="grid gap-1">
                    <Label htmlFor={`product-${item.id}`}>Producto del catálogo</Label>
                    <Select
                      id={`product-${item.id}`}
                      value={resolution.productId}
                      onValueChange={(value) => updateResolution(item.id, "productId", value)}
                      searchPlaceholder="Buscar producto o SKU…"
                      options={[
                        { value: "", label: "Seleccionar producto" },
                        ...products.map((p) => ({
                          value: p.id,
                          label: p.name,
                          meta: `${p.sku} · $${Number(p.basePrice).toLocaleString("es-CO")}/${p.unit}`,
                        })),
                      ]}
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`price-${item.id}`}>Precio unitario</Label>
                    <Input
                      id={`price-${item.id}`}
                      type="number"
                      min={0}
                      step={0.01}
                      value={String(resolution.unitPrice)}
                      onChange={(e) => updateResolution(item.id, "unitPrice", Number(e.target.value))}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => resolveItem(item.id)}
                      disabled={loading || !resolution.productId}
                    >
                      {loading ? "..." : "Resolver"}
                    </Button>
                  </div>
                </div>
                {selectedProduct && (
                  <p className="text-xs text-muted-foreground">
                    Precio base: ${Number(selectedProduct.basePrice).toLocaleString("es-CO")}/{selectedProduct.unit}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap gap-3">
        <Button onClick={approve} disabled={loading || unresolvedItems.length > 0}>
          {loading ? "Procesando..." : "Aprobar pedido"}
        </Button>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="reject-reason">Motivo del rechazo</Label>
        <textarea
          id="reject-reason"
          className="min-h-[72px] w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          placeholder="Describe el motivo del rechazo..."
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
        />
        <Button
          variant="destructive"
          onClick={reject}
          disabled={loading || !rejectReason.trim()}
          className="w-fit"
        >
          {loading ? "Procesando..." : "Rechazar pedido"}
        </Button>
      </div>
    </div>
  );
}
