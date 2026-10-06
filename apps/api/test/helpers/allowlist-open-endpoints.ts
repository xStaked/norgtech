/**
 * ALLOWLIST_OPEN — write endpoints (POST/PATCH/PUT/DELETE) that are
 * intentionally without `@Roles` metadata.
 *
 * This list must only contain endpoints that are genuinely public or are
 * guarded by a non-RBAC mechanism (e.g. a service token). Do NOT add an
 * endpoint here just to make the coverage sweep pass — every entry needs a
 * one-line justification, and the whole point of the sweep is to surface
 * real gaps so Tasks 3-6 can close them.
 */
export interface AllowlistedEndpoint {
  method: "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  reason: string;
}

export const ALLOWLIST_OPEN: AllowlistedEndpoint[] = [
  {
    method: "POST",
    path: "/auth/login",
    // Login is the entry point that issues the JWT; a caller cannot present
    // roles before authenticating.
    reason: "Public login endpoint — no session exists yet to carry roles",
  },
  {
    method: "POST",
    path: "/auth/refresh",
    // Rotates the session using the httpOnly refresh cookie; authorized by the
    // cookie itself, not by role — same class as /auth/login.
    reason: "Session refresh — authorized by httpOnly refresh cookie, not by role",
  },
  {
    method: "POST",
    path: "/auth/logout",
    // Revokes the refresh token; idempotent and safe for any authenticated
    // session regardless of role.
    reason: "Session logout — cookie-scoped, role-agnostic, idempotent",
  },
  {
    method: "POST",
    path: "/auth/forgot-password",
    // Forgot/reset are public by design (docs/seguridad-brechas.md: "auth
    // forgot/reset públicos por diseño") — same class as login/refresh/logout:
    // no session exists yet, and reset-password is authorized by the one-time
    // reset token itself.
    reason: "Public forgot-password — no session exists yet to carry roles (breach doc: public by design)",
  },
  {
    method: "POST",
    path: "/auth/reset-password",
    // Same class as forgot-password: the caller presents a one-time reset
    // token, not a session; roles cannot apply.
    reason: "Public reset-password — authorized by one-time reset token, not by role (breach doc: public by design)",
  },
  {
    method: "POST",
    path: "/whatsapp/webhooks/kapso",
    // Cerrado en fase 3 (antes era la brecha deferida del 2026-07-16): ahora
    // lo autentica KapsoWebhookGuard (HMAC X-Kapso-Signature o token
    // X-Webhook-Token, modos strict/warn) — mecanismo de auth no-RBAC, esta
    // entrada legitima que el sweep lo conte como abierto por diseño.
    reason:
      "Kapso webhook guarded by KapsoWebhookGuard (HMAC/token, non-RBAC auth) — public by design like /auth/login",
  },
  {
    method: "PATCH",
    path: "/notifications/:id/read",
    // Personal resource per user — authorization is row ownership (userId = token
    // subject), not role; no @Roles applies by design.
    reason:
      "Personal resource per user — authorization is row ownership (userId = token subject), not role; no @Roles applies by design",
  },
  {
    method: "POST",
    path: "/notifications/read-all",
    // Personal resource per user — authorization is row ownership (userId = token
    // subject), not role; no @Roles applies by design.
    reason:
      "Personal resource per user — authorization is row ownership (userId = token subject), not role; no @Roles applies by design",
  },
];
