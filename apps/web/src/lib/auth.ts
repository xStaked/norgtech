export const SESSION_COOKIE_NAME = "session_token";

export function getSessionTokenClient(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${SESSION_COOKIE_NAME}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}
