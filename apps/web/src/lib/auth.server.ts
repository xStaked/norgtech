import { cookies } from "next/headers";
import { apiFetch } from "./api.server";
import { type UserRole, USER_ROLES } from "./auth";

export const SESSION_COOKIE_NAME = "session_token";

export async function getSessionToken() {
  return (await cookies()).get(SESSION_COOKIE_NAME)?.value ?? null;
}

export async function isAuthenticated() {
  return (await getSessionToken()) !== null;
}

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = await getSessionToken();
  if (!token) return null;

  try {
    const response = await apiFetch("/auth/me", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) return null;

    const data = (await response.json()) as {
      id?: string;
      name?: string;
      email?: string;
      role?: string;
    };

    if (
      typeof data.id === "string" &&
      typeof data.email === "string" &&
      typeof data.role === "string" &&
      USER_ROLES.includes(data.role as UserRole)
    ) {
      return {
        id: data.id,
        name: typeof data.name === "string" ? data.name : data.email,
        email: data.email,
        role: data.role as UserRole,
      };
    }

    return null;
  } catch (error) {
    // El `redirect()` de Next viaja como excepcion. Si se traga aca, la sesion
    // vencida vuelve a terminar en la pantalla mocha en vez de ir a renovar.
    if (isRedirectError(error)) throw error;
    return null;
  }
}

function isRedirectError(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}
