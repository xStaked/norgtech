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
];
