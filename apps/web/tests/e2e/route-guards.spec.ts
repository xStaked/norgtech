import { expect, test } from "@playwright/test";

import { resolveRoleRedirect } from "../../src/lib/route-guards";
import type { UserRole } from "../../src/lib/auth";

function makeFakeJwt(role: string) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ role, sub: "x", exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365 }),
  ).toString("base64url");
  return `${header}.${payload}.sig`;
}

// Pure-function coverage of the guard logic — exercised directly, no browser/server needed.
test.describe("resolveRoleRedirect (pure)", () => {
  test("no role (no/invalid token) on a protected path redirects to /login", () => {
    expect(resolveRoleRedirect("/orders", null)).toBe("/login");
    expect(resolveRoleRedirect("/companies", null)).toBe("/login");
  });

  test("unrestricted protected path allows any authenticated role", () => {
    expect(resolveRoleRedirect("/orders", "logistica")).toBeNull();
    expect(resolveRoleRedirect("/dashboard", "tecnico")).toBeNull();
  });

  // Note: "logistica" is intentionally NOT used here — createAccess.order includes
  // "logistica" (logistics staff can create orders), so it must NOT be redirected.
  // "tecnico" has no order-create rights and is the correct negative case.
  test("tecnico hitting /orders/new (create-order not allowed) is redirected to forbidden", () => {
    expect(resolveRoleRedirect("/orders/new", "tecnico" as UserRole)).toBe("/dashboard?forbidden=1");
  });

  test("logistica can still create an order via /orders/new (has create rights)", () => {
    expect(resolveRoleRedirect("/orders/new", "logistica" as UserRole)).toBeNull();
  });

  test("comercial hitting /companies is redirected to forbidden", () => {
    expect(resolveRoleRedirect("/companies", "comercial" as UserRole)).toBe("/dashboard?forbidden=1");
  });

  test("administrador hitting /companies is NOT redirected", () => {
    expect(resolveRoleRedirect("/companies", "administrador" as UserRole)).toBeNull();
  });

  test("director_comercial hitting /zones is NOT redirected", () => {
    expect(resolveRoleRedirect("/zones", "director_comercial" as UserRole)).toBeNull();
  });

  test("comercial can still create an order via /orders/new", () => {
    expect(resolveRoleRedirect("/orders/new", "comercial" as UserRole)).toBeNull();
  });
});

// End-to-end coverage through the real Next.js middleware, using a crafted fake JWT
// cookie (no backend call — the middleware only base64-decodes the payload).
test.describe("route guards (browser, fake JWT cookie)", () => {
  // "tecnico" lacks order-create rights (createAccess.order does not include it),
  // unlike "logistica" which the task brief cited but which actually IS allowed to
  // create orders per src/lib/auth.ts — see the pure-function tests above.
  test("tecnico -> /orders/new redirects to /dashboard?forbidden=1", async ({ page, context }) => {
    await context.addCookies([
      {
        name: "session_token",
        value: makeFakeJwt("tecnico"),
        url: "http://localhost:3002",
      },
    ]);

    await page.goto("/orders/new");
    await expect(page).toHaveURL(/\/dashboard\?forbidden=1$/);
  });

  test("comercial -> /companies redirects to /dashboard?forbidden=1", async ({ page, context }) => {
    await context.addCookies([
      {
        name: "session_token",
        value: makeFakeJwt("comercial"),
        url: "http://localhost:3002",
      },
    ]);

    await page.goto("/companies");
    await expect(page).toHaveURL(/\/dashboard\?forbidden=1$/);
  });

  test("administrador -> /companies does NOT redirect", async ({ page, context }) => {
    await context.addCookies([
      {
        name: "session_token",
        value: makeFakeJwt("administrador"),
        url: "http://localhost:3002",
      },
    ]);

    await page.goto("/companies");
    await expect(page).toHaveURL(/\/companies$/);
  });
});
