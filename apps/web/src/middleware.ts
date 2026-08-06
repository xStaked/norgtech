import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  SESSION_COOKIE_NAME,
  buildSessionRefreshUrl,
  getUserRoleFromToken,
  isTokenExpired,
} from "@/lib/auth";
import { matchesPrefix, protectedPaths, resolveRoleRedirect } from "@/lib/route-guards";

export { resolveRoleRedirect } from "@/lib/route-guards";

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isProtectedPath = protectedPaths.some((protectedPath) => matchesPrefix(pathname, protectedPath));

  if (!isProtectedPath) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Antes solo se decodificaba el rol, asi que un token vencido pasaba igual:
  // la pagina se renderizaba con 200 pero `getCurrentUser()` en null (sidebar
  // sin items, listas vacias) y sin redirigir a ningun lado. Ese es el "no me
  // esta cargando" a los 15 minutos.
  //
  // Renovar aca mismo no se puede: el `refresh_token` es httpOnly y lo emite la
  // API para SU propio host con `path=/auth`, asi que el servidor de Next nunca
  // lo recibe. El unico que lo tiene es el navegador, asi que se lo rebota a
  // /session/refresh, que hace el mismo POST /auth/refresh que api.client.ts y
  // vuelve a esta ruta.
  if (isTokenExpired(token)) {
    // Solo las navegaciones: un POST (form, server action) no se puede rebotar
    // sin perder el cuerpo, y en el navegador ya lo cubre el interceptor 401 de
    // api.client.ts.
    if (request.method !== "GET") {
      return NextResponse.next();
    }
    const next = `${pathname}${request.nextUrl.search}`;
    return NextResponse.redirect(new URL(buildSessionRefreshUrl(next), request.url));
  }

  const role = getUserRoleFromToken(token);
  const redirectPath = resolveRoleRedirect(pathname, role);

  if (redirectPath) {
    return NextResponse.redirect(new URL(redirectPath, request.url));
  }

  // api.server.ts no tiene forma de saber que ruta se esta renderizando, y la
  // necesita para volver aca si le toca rebotar al refresh a mitad del render.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", `${pathname}${request.nextUrl.search}`);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/customers/:path*",
    "/opportunities/:path*",
    "/quotes/:path*",
    "/orders/:path*",
    "/billing-requests/:path*",
    "/products/:path*",
    "/visits/:path*",
    "/expenses/:path*",
    "/follow-ups/:path*",
    "/agenda/:path*",
    "/nora",
    "/nora/:path*",
    "/companies/:path*",
    "/zones/:path*",
    "/invoices/:path*",
    // Estaba en `protectedPaths` pero no aca, asi que el middleware nunca
    // corria para analitica. No era un hueco de datos (el API responde 403),
    // pero ahora que entra un rol mas conviene que el guard tambien aplique.
    "/analytics/:path*",
    // Mismo hueco que analitica: sin este matcher el middleware nunca corria
    // para reportes, asi que una sesion vencida o ausente no redirigia a
    // /login: la pantalla se renderizaba con 200 pero sin sidebar ni datos,
    // que es exactamente el "no me esta cargando" que se vio en la demo.
    "/reports/:path*",
    // Estas tres renderizan en servidor con `apiFetch` y tampoco estaban en el
    // matcher: con el token vencido daban la misma pantalla mocha.
    "/users/:path*",
    "/whatsapp/:path*",
    "/returns/:path*",
  ],
};
