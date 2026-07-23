"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetchClient } from "@/lib/api.client";

/**
 * Consulta un endpoint que devuelve `{ count }` cada `intervalMs`.
 * Extraido de sidebar-nav para que la campana y el badge de WhatsApp no
 * tengan dos implementaciones del mismo poll.
 */
export function usePollCount(path: string, intervalMs = 15000) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    const res = await apiFetchClient(path);
    if (res.ok) {
      const data = (await res.json()) as { count: number };
      setCount(data.count);
    }
  }, [path]);

  useEffect(() => {
    let alive = true;

    async function poll() {
      const res = await apiFetchClient(path);
      if (alive && res.ok) {
        const data = (await res.json()) as { count: number };
        setCount(data.count);
      }
    }

    void poll();
    const id = setInterval(poll, intervalMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [path, intervalMs]);

  return { count, refresh };
}
