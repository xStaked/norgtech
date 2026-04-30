import { cookies } from "next/headers";

export const SESSION_COOKIE_NAME = "session_token";

export async function getSessionToken() {
  return (await cookies()).get(SESSION_COOKIE_NAME)?.value ?? null;
}

export async function isAuthenticated() {
  return (await getSessionToken()) !== null;
}
