import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

// Covers Task 4 of docs/superpowers/plans/2026-07-16-sesion-refresh-token.md (AUTH-01):
// single-flight 401 refresh interceptor in src/lib/api.client.ts.
//
// The app's real /auth/refresh and protected endpoints are mocked at the network
// boundary (page.route) so the scenarios are deterministic — real bearer-token
// verification requires a signed JWT from the API's secret, which isn't needed
// here since we're testing the *client* interceptor's behavior around a 401
// response, not the API's token validation itself (already covered by API tests).

const API_URL = "http://localhost:3001";

function fakeJwt(role: string, sub = "u1") {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ role, sub, email: "a@b.com", exp: Math.floor(Date.now() / 1000) + 3600 }),
  ).toString("base64url");
  return `${header}.${payload}.sig`;
}

async function seedSession(page: Page, token: string) {
  // administrador can access /zones/new per canAccess(); middleware only decodes
  // the JWT payload (no signature check), matching route-guards.spec.ts.
  await page.context().addCookies([
    {
      name: "session_token",
      value: token,
      url: "http://localhost:3002",
    },
  ]);
}

test.describe("session refresh interceptor (AUTH-01)", () => {
  test("expired access token + valid refresh: request retries and completes without landing on /login", async ({
    page,
  }) => {
    let zonesCalls = 0;
    let refreshCalls = 0;

    // The refreshed token must be a well-formed JWT (not an opaque string): once
    // it's written to the session_token cookie, the SPA's client-side navigation
    // to /zones/zone-1 re-runs Next.js middleware, which decodes the cookie's
    // role and would otherwise bounce an invalid-looking token back to /login.
    const refreshedToken = fakeJwt("administrador", "u1-refreshed");

    await page.route(`${API_URL}/zones`, async (route) => {
      zonesCalls += 1;
      const auth = route.request().headers()["authorization"];
      if (auth === `Bearer ${refreshedToken}`) {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ id: "zone-1", name: "Costa" }),
        });
        return;
      }
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ message: "Invalid token" }),
      });
    });

    await page.route(`${API_URL}/auth/refresh`, async (route) => {
      refreshCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ accessToken: refreshedToken }),
      });
    });

    // GET on the created zone's detail page (post-navigation) isn't part of this
    // scenario — stub it so the follow-up request doesn't hit the real network.
    await page.route(`${API_URL}/zones/zone-1`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "zone-1", name: "Costa" }),
      });
    });

    await seedSession(page, fakeJwt("administrador", "u1-initial"));
    await page.goto("/zones/new");

    await page.getByLabel("Nombre *").fill("Costa");
    await page.evaluate(() => document.querySelector("form")?.requestSubmit());

    await expect(page).toHaveURL(/\/zones\/zone-1$/, { timeout: 10_000 });
    expect(zonesCalls).toBe(2); // original 401 + retry with new token
    expect(refreshCalls).toBe(1);
  });

  test("invalid refresh: protected call clears session and redirects to /login?expired=1", async ({ page }) => {
    let refreshCalls = 0;

    await page.route(`${API_URL}/zones`, async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ message: "Invalid token" }),
      });
    });

    await page.route(`${API_URL}/auth/refresh`, async (route) => {
      refreshCalls += 1;
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ message: "Sesión expirada" }),
      });
    });

    await seedSession(page, fakeJwt("administrador"));
    await page.goto("/zones/new");

    await page.getByLabel("Nombre *").fill("Costa");
    await page.evaluate(() => document.querySelector("form")?.requestSubmit());

    await expect(page).toHaveURL(/\/login\?expired=1$/, { timeout: 10_000 });
    expect(refreshCalls).toBe(1);

    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find((c) => c.name === "session_token");
    expect(sessionCookie === undefined || sessionCookie.value === "").toBeTruthy();
  });

  test("parallel 401s trigger a single shared refresh (no thundering herd)", async ({ page }) => {
    let refreshCalls = 0;
    let zonesCalls = 0;

    // Always 401 with "Invalid token", regardless of the bearer used — this proves
    // the retried request does NOT trigger a second refresh (no infinite loop) while
    // two concurrent original requests still only cause one /auth/refresh call.
    await page.route(`${API_URL}/zones`, async (route) => {
      zonesCalls += 1;
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ message: "Invalid token" }),
      });
    });

    await page.route(`${API_URL}/auth/refresh`, async (route) => {
      refreshCalls += 1;
      // Small delay so both concurrent callers are guaranteed to observe the
      // in-flight promise instead of racing to start their own refresh.
      await new Promise((r) => setTimeout(r, 200));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ accessToken: "new-token" }),
      });
    });

    await seedSession(page, fakeJwt("administrador"));
    await page.goto("/zones/new");
    await page.getByLabel("Nombre *").fill("Costa");

    // Fire two submissions back-to-back in the same task so both handleSubmit
    // invocations start their fetch before either resolves (real concurrency
    // within the same JS realm/module instance as apiFetchClient's mutex).
    await page.evaluate(() => {
      const form = document.querySelector("form");
      form?.requestSubmit();
      form?.requestSubmit();
    });

    await expect
      .poll(() => refreshCalls, { timeout: 10_000 })
      .toBeGreaterThanOrEqual(1);
    // give any stray follow-up calls a moment to arrive, then assert exactly one
    await page.waitForTimeout(500);
    expect(refreshCalls).toBe(1);
    expect(zonesCalls).toBeGreaterThanOrEqual(2);
  });
});
