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
    path: "/whatsapp/webhooks/kapso",
    // SECURITY FINDING (deferred by user 2026-07-16): Kapso webhook currently has NO guard. ServiceTokenGuard exists but is unapplied; applying it may break the live Kapso integration until the token header is confirmed. Allowlisted to keep the sweep green as a regression gate for NEW gaps — this is a known, tracked hole, not an approval.
    reason:
      "SECURITY FINDING (deferred by user 2026-07-16): Kapso webhook currently has NO guard. ServiceTokenGuard exists but is unapplied; applying it may break the live Kapso integration until the token header is confirmed. Allowlisted to keep the sweep green as a regression gate for NEW gaps — this is a known, tracked hole, not an approval.",
  },
];
