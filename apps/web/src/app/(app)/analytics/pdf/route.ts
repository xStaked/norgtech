import { apiFetch } from "@/lib/api.server";
import { FILTER_KEYS } from "@/lib/analytics";

/**
 * Proxy autenticado del informe de desempeño en PDF. Mismo camino que el CSV
 * (`../csv/route.ts`): un `<a href>` al API no lleva el Bearer token, que vive
 * en la cookie de sesion y solo lo adjunta `apiFetch` server-side.
 *
 * El acotado por vendedor lo decide el API, no esta ruta: si el que descarga es
 * un comercial, `resolveFilters` le fuerza su propio id aunque la URL traiga
 * otro `sellerUserId`.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = new URLSearchParams({ format: "pdf" });
  for (const key of FILTER_KEYS) {
    const value = url.searchParams.get(key);
    if (value) query.set(key, value);
  }

  const upstream = await apiFetch(`/analytics/seller-performance?${query.toString()}`);

  if (!upstream.ok || !upstream.body) {
    return new Response("No se pudo generar el informe.", {
      status: upstream.status === 200 ? 502 : upstream.status,
    });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="informe-desempeno.pdf"`,
    },
  });
}
