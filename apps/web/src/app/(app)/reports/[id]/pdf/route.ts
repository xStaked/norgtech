import { apiFetch } from "@/lib/api.server";

/**
 * REP-01: "Descargar PDF" apuntaba a /reports/:id/pdf esperando que existiera
 * una ruta Next, pero solo existe el endpoint del API. Este Route Handler
 * hace de proxy autenticado: `apiFetch` adjunta el Bearer token de la sesion
 * (cookie) igual que el resto de llamadas server-side, y reenviamos el PDF tal
 * cual con su Content-Type / Content-Disposition.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const upstream = await apiFetch(`/reports/${id}/pdf`);

  if (!upstream.ok || !upstream.body) {
    return new Response("No se pudo generar el PDF del reporte.", {
      status: upstream.status === 200 ? 502 : upstream.status,
    });
  }

  const headers = new Headers();
  headers.set(
    "Content-Type",
    upstream.headers.get("Content-Type") ?? "application/pdf",
  );
  headers.set(
    "Content-Disposition",
    upstream.headers.get("Content-Disposition") ??
      `attachment; filename="reporte-${id}.pdf"`,
  );

  return new Response(upstream.body, { status: 200, headers });
}
