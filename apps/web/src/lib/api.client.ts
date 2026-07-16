import { clearSessionClient, getSessionTokenClient, setSessionTokenClient } from "./auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// Mutex a nivel de módulo: garantiza un solo POST /auth/refresh en vuelo aunque
// varias peticiones concurrentes reciban un 401 al mismo tiempo (single-flight).
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = fetch(new URL("/auth/refresh", API_URL).toString(), {
      method: "POST",
      credentials: "include", // envía el cookie httpOnly refresh_token cross-origin
    })
      .then(async (r) => {
        if (!r.ok) return null;
        const data = (await r.json()) as { accessToken?: string };
        if (!data.accessToken) return null;
        setSessionTokenClient(data.accessToken);
        return data.accessToken;
      })
      .catch(() => null)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

export async function apiFetchClient(path: string, init?: RequestInit): Promise<Response> {
  const doFetch = (token: string | null) => {
    const headers = new Headers(init?.headers);

    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    if (!headers.has("Content-Type") && init?.body && !(init.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }

    return fetch(new URL(path, API_URL).toString(), {
      ...init,
      headers,
      credentials: "include",
    });
  };

  const res = await doFetch(getSessionTokenClient());
  if (res.status !== 401) return res;

  // Solo reaccionar al 401 por token inválido/expirado; se lee el cuerpo
  // clonado para no consumir el original si no aplica el refresh.
  const message = await res
    .clone()
    .text()
    .catch(() => "");
  if (!message.includes("Invalid token")) return res;

  const newToken = await refreshAccessToken(); // compartido entre peticiones paralelas
  if (!newToken) {
    clearSessionClient();
    if (typeof window !== "undefined") {
      window.location.replace("/login?expired=1");
    }
    return res;
  }

  return doFetch(newToken); // reintento único; si vuelve a dar 401 no se reintenta refresh
}
