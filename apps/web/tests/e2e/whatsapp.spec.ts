import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

async function waitForBackend(request: APIRequestContext) {
  let backendReady = false;
  for (let i = 0; i < 20; i++) {
    try {
      const res = await request.get("http://localhost:3001/health");
      if (res.ok()) {
        backendReady = true;
        break;
      }
    } catch {
      // Backend may still be booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  expect(backendReady, "Backend health check failed").toBe(true);
}

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Correo").fill("admin@norgtech.com");
  await page.getByLabel("Contraseña").fill("Admin123!");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("shows whatsapp inbox for commercial operations", async ({ page, request }) => {
  await waitForBackend(request);
  await loginAsAdmin(page);

  await page.goto("/whatsapp");

  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "WhatsApp" })).toBeVisible();
  await expect(main.getByText("Conversaciones", { exact: true })).toBeVisible();
  await expect(main.getByText("Pedido", { exact: true })).toBeVisible();
});
