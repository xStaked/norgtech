import { getSessionToken, getSessionTokenClient } from "./auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export async function apiFetch(path: string, init?: RequestInit) {
  const token = await getSessionToken();
  const headers = new Headers(init?.headers);

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(new URL(path, API_URL), {
    ...init,
    headers,
  });
}

export function apiFetchClient(path: string, init?: RequestInit) {
  const token = getSessionTokenClient();
  const headers = new Headers(init?.headers);

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(new URL(path, API_URL).toString(), {
    ...init,
    headers,
  });
}
