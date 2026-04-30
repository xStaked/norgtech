import { expect, test } from "@playwright/test";

test("an authenticated user can create a customer", async ({ page, request }) => {
  // Wait for backend to be ready
  let backendReady = false;
  for (let i = 0; i < 20; i++) {
    try {
      const res = await request.get("http://localhost:3001/health");
      if (res.ok()) {
        backendReady = true;
        break;
      }
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  expect(backendReady, "Backend health check failed").toBe(true);

  await page.goto("/login");
  await page.getByLabel("Correo").fill("admin@norgtech.local");
  await page.getByLabel("Contraseña").fill("Admin123*");
  await page.getByRole("button", { name: "Ingresar" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/customers/new");

  await page.locator('select[name="segmentId"]').selectOption({ index: 1 });
  await page.getByLabel("Razon social").fill("Agropecuaria Norte SAS");
  await page.getByLabel("Nombre comercial").fill("Agro Norte");
  await page.locator('input[name="contactFullName"]').fill("Carlos Perez");

  await page.getByRole("button", { name: "Guardar cliente" }).click();

  await page.waitForURL(/\/customers\/[a-z0-9_-]+$/i, { timeout: 10000 });
  await expect(page.getByRole("heading", { name: "Agro Norte" })).toBeVisible();
});
