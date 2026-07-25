import { apiFetch } from "@/lib/api.server";
import { ANALYTICS_SCREENS, FILTER_KEYS } from "@/lib/analytics";

/**
 * Proxy autenticado del CSV. Un `<a href>` al API desde el navegador no lleva
 * el Bearer token (vive en la cookie de sesion y solo lo adjunta `apiFetch`
 * server-side), asi que la descarga pasa por aqui — mismo patron que el PDF de
 * reportes.
 *
 * `?screen=ventas` + los mismos filtros de la pantalla: el CSV exporta
 * exactamente lo que se esta viendo, sin truncar a top-N (spec §2.5).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const screen = ANALYTICS_SCREENS.find((item) => item.slug === url.searchParams.get("screen"));

  if (!screen) {
    return new Response("Pantalla de analítica desconocida.", { status: 400 });
  }

  const query = new URLSearchParams({ format: "csv" });
  for (const key of FILTER_KEYS) {
    const value = url.searchParams.get(key);
    if (value) query.set(key, value);
  }

  const upstream = await apiFetch(`/analytics/${screen.endpoint}?${query.toString()}`);

  if (!upstream.ok || !upstream.body) {
    return new Response("No se pudo generar el CSV.", {
      status: upstream.status === 200 ? 502 : upstream.status,
    });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="analitica-${screen.slug}.csv"`,
    },
  });
}
