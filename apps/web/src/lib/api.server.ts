import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { buildSessionRefreshUrl, isTokenExpired, sanitizeNextPath } from "./auth";
import { getSessionToken } from "./auth.server";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/**
 * Aca no se puede renovar el token como en api.client.ts, por dos motivos que se
 * suman:
 *
 * 1. El `refresh_token` es httpOnly y lo emite la API para su propio host con
 *    `path=/auth`; el servidor de Next nunca lo recibe, asi que no tiene con que
 *    pedir un access token nuevo.
 * 2. Aunque lo tuviera, en Next 16 `cookies().set()` solo funciona en Server
 *    Actions y Route Handlers, no durante el render de un Server Component — y
 *    en esta app `apiFetch` se llama exclusivamente desde el render.
 *
 * El unico que tiene el refresh token es el navegador, asi que la renovacion se
 * le delega a el: se corta el render y se rebota a /session/refresh, que hace el
 * mismo POST /auth/refresh que api.client.ts, reescribe el cookie `session_token`
 * y vuelve a la ruta original.
 *
 * El disparador es `exp` y no el 401 de la API (a diferencia de api.client.ts): un
 * 401 rebota la pagina entera, y si la API llegara a rechazar tokens recien
 * emitidos eso deja al usuario girando entre el login y el rebote. `exp` se decide
 * local y sin ambiguedad. En la practica el middleware lo agarra antes; esto es la
 * red por si alguna ruta protegida vuelve a quedar fuera del matcher, que ya paso
 * dos veces (ver los comentarios de /analytics y /reports en middleware.ts).
 */
async function redirectToSessionRefresh(): Promise<never> {
  // El pathname lo inyecta el middleware; sin el se vuelve al dashboard.
  const next = sanitizeNextPath((await headers()).get("x-pathname"));
  redirect(buildSessionRefreshUrl(next));
}

export async function apiFetch(path: string, init?: RequestInit) {
  const token = await getSessionToken();

  if (token && isTokenExpired(token)) {
    await redirectToSessionRefresh();
  }

  const requestHeaders = new Headers(init?.headers);

  if (token) {
    requestHeaders.set("Authorization", `Bearer ${token}`);
  }

  if (!requestHeaders.has("Content-Type") && init?.body) {
    requestHeaders.set("Content-Type", "application/json");
  }

  return fetch(new URL(path, API_URL), {
    ...init,
    headers: requestHeaders,
  });
}
