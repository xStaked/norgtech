const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export async function apiFetch(path: string, init?: RequestInit) {
  return fetch(new URL(path, API_URL), init);
}
