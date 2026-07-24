"use client";

import { useEffect, useState } from "react";
import {
  fetchPricingPreview,
  type PreviewItemInput,
  type PricingPreview,
} from "./pricing-preview";

/**
 * Debounced authoritative pricing. Returns null until there is a customer and
 * at least one valid line, so callers render "—" rather than a number they
 * invented locally.
 */
export function usePricingPreview(
  endpoint: "/quotes/preview" | "/orders/preview",
  customerId: string,
  items: PreviewItemInput[],
) {
  const [preview, setPreview] = useState<PricingPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Serializing the inputs keeps the effect from re-firing on every render
  // just because `items` is a fresh array identity.
  const key = JSON.stringify({ customerId, items });

  useEffect(() => {
    const { customerId: cid, items: lines } = JSON.parse(key) as {
      customerId: string;
      items: PreviewItemInput[];
    };

    if (!cid || lines.length === 0) {
      setPreview(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const timer = setTimeout(async () => {
      const result = await fetchPricingPreview(endpoint, cid, lines);
      // Guard against an earlier, slower response overwriting a newer one.
      if (cancelled) return;
      setPreview(result.preview);
      setError(result.error);
      setLoading(false);
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [endpoint, key]);

  return { preview, loading, error };
}
