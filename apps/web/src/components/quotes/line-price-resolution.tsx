"use client";

import { useEffect, useState } from "react";
import { apiFetchClient } from "@/lib/api.client";
import { formatPrice } from "@/lib/catalog";

/**
 * Los tres estados que devuelve
 * `GET /products/:id/price-for-customer/:customerId`. Ver §3.F de
 * docs/catalogo-front-spec.md.
 */
export type PriceResolution =
  | {
      source: "price_list";
      priceListName: string;
      currency: string;
      empaque: string;
      priceSinIva: string;
      priceConIva: string | null;
      taxPercent: string | null;
    }
  | {
      source: "ambiguous";
      priceListName: string;
      currency: string;
      options: {
        presentationId: string;
        empaque: string;
        form: string | null;
        priceSinIva: string | null;
        priceConIva: string | null;
      }[];
    }
  | {
      source: "base_price";
      basePrice: string;
      discountPercent: string;
      finalPrice: string;
      meetsGoal: boolean;
    };

interface LinePriceResolutionProps {
  productId: string;
  customerId: string;
  presentationId: string;
  onSelectPresentation: (presentationId: string) => void;
}

export function LinePriceResolution({
  productId,
  customerId,
  presentationId,
  onSelectPresentation,
}: LinePriceResolutionProps) {
  const [resolution, setResolution] = useState<PriceResolution | null>(null);

  useEffect(() => {
    if (!productId || !customerId) {
      setResolution(null);
      return;
    }

    let cancelled = false;
    const query = presentationId ? `?presentationId=${encodeURIComponent(presentationId)}` : "";

    apiFetchClient(`/products/${productId}/price-for-customer/${customerId}${query}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: PriceResolution | null) => {
        if (!cancelled) setResolution(data);
      })
      .catch(() => {
        if (!cancelled) setResolution(null);
      });

    return () => {
      cancelled = true;
    };
  }, [productId, customerId, presentationId]);

  if (!resolution) return null;

  if (resolution.source === "ambiguous") {
    return (
      <div className="rounded-[10px] border border-[#f5dfb8] bg-[#fdf0dc] p-3">
        <div className="mb-1 flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="text-[13px] font-bold text-foreground">Elige la presentación</div>
            <p className="mt-0.5 text-xs text-[#6d4a10]">
              Tiene {resolution.options.length} presentaciones con precio en la lista{" "}
              <b>{resolution.priceListName}</b>. Cotizar el empaque equivocado despacha el
              producto equivocado.
            </p>
          </div>
        </div>

        <div className="mt-2 flex flex-col gap-2">
          {resolution.options.map((option) => {
            const selected = option.presentationId === presentationId;
            return (
              <button
                key={option.presentationId}
                type="button"
                onClick={() => onSelectPresentation(option.presentationId)}
                className={`flex items-center gap-3 rounded-[10px] border px-3.5 py-2.5 text-left transition-colors ${
                  selected
                    ? "border-[1.5px] border-[#0f5c8a] bg-[#eff4fb] shadow-[0_0_0_3px_rgba(15,92,138,.08)]"
                    : "border-input bg-card hover:border-[#c7d3df] hover:bg-[#f9fbfd]"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`h-[18px] w-[18px] shrink-0 rounded-full bg-white ${
                    selected ? "border-[5px] border-[#0f5c8a]" : "border-[1.5px] border-[#c2cbd6]"
                  }`}
                />
                <span className="flex-1">
                  <span className="block text-[13.5px] font-bold text-foreground">
                    {option.empaque}
                  </span>
                  {option.form ? (
                    <span className="block text-[11.5px] text-muted-foreground">
                      {option.form}
                    </span>
                  ) : null}
                </span>
                <span className="text-right">
                  <span className="block font-mono text-sm font-semibold text-[#3d6b2f]">
                    {formatPrice(option.priceSinIva, resolution.currency)}
                  </span>
                  <span className="block text-[10.5px] text-muted-foreground">
                    sin IVA · con IVA {formatPrice(option.priceConIva, resolution.currency) || "—"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (resolution.source === "price_list") {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md bg-[#e6f4ec] px-3 py-1.5 text-[12.5px] text-[#167c4a]">
        <span className="rounded bg-[#d3ecdd] px-1.5 py-px text-[10.5px] font-bold">
          {resolution.priceListName}
        </span>
        <span className="rounded bg-[#d3ecdd] px-1.5 py-px text-[10.5px] font-bold">
          {resolution.currency}
        </span>
        <span className="font-semibold">{resolution.empaque}</span>
        <span className="text-muted-foreground">
          precio negociado con el cliente
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-[#eef1f5] px-3 py-1.5 text-[12.5px] text-[#5b6b80]">
      <span className="rounded bg-[#fdf0dc] px-1.5 py-px text-[10.5px] font-bold text-[#9a6410]">
        Sin lista asignada
      </span>
      <span>precio base del producto</span>
    </div>
  );
}
