import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

// El interceptor de api.client.ts (session-refresh.spec.ts) solo cubre el fetch
// del navegador. Lo que se rompia a los 15 minutos era el render de servidor:
// `api.server.ts` no renovaba nada y el middleware solo decodificaba el rol sin
// mirar `exp`, asi que la pagina devolvia 200 con `getCurrentUser()` en null —
// sidebar sin items y listas vacias, sin redirigir ni mostrar error.
//
// Estos casos necesitan la API real: el rebote de /session/refresh depende del
// cookie httpOnly `refresh_token`, que solo emite el backend.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const EMAIL = "admin@norgtech.com";
const PASSWORD = "Admin123!";

// El middleware solo decodifica el payload: la firma nunca se verifica porque
// el token vencido no llega a viajar a la API (se rebota antes).
function expiredJwt() {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      role: "administrador",
      sub: "u1",
      email: EMAIL,
      exp: Math.floor(Date.now() / 1000) - 60,
    }),
  ).toString("base64url");
  return `${header}.${payload}.sig`;
}

async function sessionCookie(page: Page) {
  const cookies = await page.context().cookies();
  return cookies.find((c) => c.name === "session_token")?.value ?? null;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.locator("#email").fill(EMAIL);
  // Por id: el ojo de "Mostrar contraseña" comparte el label del input.
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
}

// Sustituye el access token por uno vencido dejando intacto el `refresh_token`
// httpOnly de la API: es exactamente el estado de la sesion a los 15 minutos.
async function expireAccessToken(page: Page) {
  await page.context().addCookies([
    { name: "session_token", value: expiredJwt(), url: "http://localhost:3000" },
  ]);
}

test.beforeEach(async ({ request }) => {
  const health = await request.get(`${API_URL}/health`).catch(() => null);
  expect(health?.ok(), `La API tiene que estar arriba en ${API_URL}`).toBe(true);
});

test("access vencido + refresh valido: la pantalla de servidor carga y la sesion se renueva", async ({
  page,
}) => {
  await login(page);
  await expireAccessToken(page);

  await page.goto("/customers");

  // Vuelve sola a la ruta pedida (rebote por /session/refresh, transparente).
  await expect(page).toHaveURL(/\/customers$/, { timeout: 15_000 });

  // La prueba de que el render de servidor vio una sesion valida: sin ella el
  // sidebar sale con cero items (canAccess(null, …) es false para todo).
  const navLinks = page.locator('nav[aria-label="Navegación principal"] a');
  await expect.poll(() => navLinks.count(), { timeout: 10_000 }).toBeGreaterThan(0);
  await expect(page.getByRole("heading", { name: "Clientes", exact: true })).toBeVisible();

  // Y el cookie quedo con un access token nuevo, no con el vencido.
  const token = await sessionCookie(page);
  expect(token).not.toBe(expiredJwt());
  const exp = JSON.parse(Buffer.from(token!.split(".")[1], "base64url").toString()).exp;
  expect(exp * 1000).toBeGreaterThan(Date.now());
});

test("access y refresh vencidos: va al login, no a una pantalla vacia", async ({ page }) => {
  await login(page);
  await page.context().clearCookies({ name: "refresh_token" });
  await expireAccessToken(page);

  await page.goto("/customers");

  await expect(page).toHaveURL(/\/login\?expired=1$/, { timeout: 15_000 });
});
